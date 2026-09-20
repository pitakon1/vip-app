import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DatePicker, Input, InputNumber, Modal, message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

/**
 * 租客门户 · 房源详情（对齐 rental-full-draft/pages/tenant-property-detail.html）
 * 区块顺序：面包屑 → 图集 → 双业务价格区 → 核心信息(+同小区横评)
 *          → 卖点与配套 → 房源描述与翻译 → 位置与周边 → 底部固定操作栏
 * 数据全部来自真实接口，无数据渲染空态，不填充示例数据。
 */

interface PropertyItem {
  id: string
  room_number: string
  project_id?: string | null
  project_name?: string | null
  owner_id?: string
  status: string
  monthly_rent: number
  currency?: string
  deposit_months?: number
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  floor?: number
  building?: string
  address?: string
  property_type?: string
  furnished?: boolean
  description?: string
  available_from?: string
  video_url?: string
  photos?: any[]
  [key: string]: any
}

interface ProjectItem {
  id: string
  name?: string
  address?: string
  district?: string
  city?: string
  nearest_subway?: string
  developer?: string
  property_management_company?: string
  [key: string]: any
}

interface SaleListingItem {
  id: string
  property_id?: string | null
  title?: string
  address?: string
  asking_price?: number
  currency?: string
  status?: string
  [key: string]: any
}

const ICONS = {
  chevron: 'M9 18l6-6-6-6',
  building:
    'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4',
  play: 'M6 3l14 9-14 9z',
  vr: 'M2 8h20v8a2 2 0 0 1-2 2h-4l-2-3h-4l-2 3H4a2 2 0 0 1-2-2z',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  area: 'M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M21 16v3a2 2 0 0 1-2 2h-3 M3 16v3a2 2 0 0 0 2 2h3',
  layout: 'M3 3h18v18H3z M3 9h18 M9 21V9',
  layers: 'M12 2 2 7l10 5 10-5z M2 12l10 5 10-5 M2 17l10 5 10-5',
  tag: 'M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  sofa: 'M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M2 11h20v6H2z M6 17v2 M18 17v2',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01 9 11.01',
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  calc: 'M4 2h16v20H4z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 10h18 M8 2v4 M16 2v4 M9 16l2 2 4-4',
  subway: 'M4 4h16v12H4z M4 16l-2 4 M20 16l2 4 M8 20h8 M8 9h8',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
}

const Icon = ({ d, fill = 'none' }: { d: string; fill?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill={fill}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
)

const photoUrl = (item: any): string | null => {
  if (!item) return null
  if (typeof item === 'string') return item
  return item.url || item.src || null
}

const toItems = (res: any): any[] => {
  const payload = res?.data?.data ?? res?.data
  return payload?.items ?? []
}

const toBody = (res: any): any => {
  const payload = res?.data?.data ?? res?.data
  return payload?.data ?? payload
}

const TenantPropertyDetail = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const PROPERTY_TYPE_LABEL: Record<string, string> = {
    apartment: t('propertyType.apartment'),
    condo: t('propertyType.condo'),
    villa: t('propertyType.villa'),
    house: t('propertyType.house'),
    shop: t('propertyType.shop'),
    commercial: t('propertyType.commercial'),
    office: t('propertyType.office'),
  }

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()

  interface DetailPayload {
    detail: PropertyItem | null
    project: ProjectItem | null
    saleListing: SaleListingItem | null
    peers: PropertyItem[]
  }

  // 房源详情 + 同小区横评 + 在售挂牌：缓存优先（localStorage seed），后台刷新
  const dataQ = useCachedQuery<DetailPayload>({
    queryKey: ['tenant-property-detail', id ?? 'none'],
    cacheKey: `tenant-property-detail:${id ?? 'none'}`,
    queryFn: async (): Promise<DetailPayload> => {
      if (!id) return { detail: null, project: null, saleListing: null, peers: [] }
      const res = await api.get(`/properties/${id}`)
      const data = toBody(res) as PropertyItem | null
      const projectId = data?.project_id

      const [projRes, saleRes, peerRes] = await Promise.allSettled([
        projectId ? api.get(`/projects/${projectId}`) : Promise.resolve(null),
        api.get('/sale-listings', { params: { page: 1, page_size: 100 } }),
        projectId
          ? api.get('/properties', { params: { project_id: projectId, page: 1, page_size: 100 } })
          : Promise.resolve(null),
      ])

      let project: ProjectItem | null = null
      if (projRes.status === 'fulfilled' && projRes.value) {
        project = toBody(projRes.value) as ProjectItem
      }

      let saleListing: SaleListingItem | null = null
      if (saleRes.status === 'fulfilled') {
        const listings = toItems(saleRes.value) as SaleListingItem[]
        saleListing = listings.find((l) => String(l.property_id) === String(id)) || null
      }

      let peers: PropertyItem[] = []
      if (peerRes.status === 'fulfilled' && peerRes.value) {
        const items = toItems(peerRes.value) as PropertyItem[]
        peers = items.filter((p) => String(p.id) !== String(id))
      }

      return { detail: data, project, saleListing, peers }
    },
  })
  const detail = dataQ.data?.detail ?? null
  const project = dataQ.data?.project ?? null
  const saleListing = dataQ.data?.saleListing ?? null
  const peers = dataQ.data?.peers ?? []
  const loading = dataQ.isPending && !dataQ.data

  // 收藏状态：实时查询不落盘缓存，避免收藏态跨会话陈旧
  const favQ = useQuery({
    queryKey: ['tenant-property-fav', id ?? 'none', uid],
    queryFn: async () => {
      try {
        const res = await api.get(`/favorites/status/${id}`)
        return Boolean(toBody(res)?.favorited)
      } catch {
        return false
      }
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  })
  const favorited = favQ.data ?? false

  useEffect(() => {
    if (dataQ.isError && !dataQ.data) {
      message.error(t('tenantPropertyDetail.fetchFailed'))
    }
  }, [dataQ.isError, dataQ.data, t])

  useEffect(() => {
    setTranslatedDesc(null)
    setPhotoIndex(0)
    setBiz('rent')
    window.scrollTo?.({ top: 0 })
  }, [id])

  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [favBusy, setFavBusy] = useState(false)

  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingAt, setBookingAt] = useState<dayjs.Dayjs | null>(null)
  const [bookingNote, setBookingNote] = useState('')
  const [bookingBusy, setBookingBusy] = useState(false)

  const [loanOpen, setLoanOpen] = useState(false)
  const [loanDownPct, setLoanDownPct] = useState<number>(30)
  const [loanYears, setLoanYears] = useState<number>(30)
  const [loanRate, setLoanRate] = useState<number | null>(null)

  const [translating, setTranslating] = useState(false)
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null)
  const [transTarget, setTransTarget] = useState('zh')

  const photos = useMemo(() => {
    const raw = Array.isArray(detail?.photos) ? detail!.photos : []
    return raw.map(photoUrl).filter(Boolean) as string[]
  }, [detail])

  const currency = detail?.currency || 'THB'

  // 同小区均价横评（同项目其他房源月租金均值）
  const benchmark = useMemo(() => {
    const rent = Number(detail?.monthly_rent || 0)
    const values = peers.map((p) => Number(p.monthly_rent || 0)).filter((v) => v > 0)
    if (!rent || values.length < 1) return null
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    if (!avg) return null
    const diff = ((avg - rent) / avg) * 100
    return {
      avg,
      pct: Math.abs(Math.round(diff)),
      lower: diff > 0,
      currency: peers[0]?.currency || currency,
    }
  }, [detail, peers, currency])

  const facts = useMemo(() => {
    const d = detail
    const floorText = d?.floor
      ? d?.building
        ? t('tenantPropertyDetail.buildingFloor', { building: d.building, floor: d.floor })
        : t('tenantPropertyDetail.floorText', { floor: d.floor })
      : null
    const layoutText =
      d?.bedrooms || d?.bathrooms ? t('tenantPropertyDetail.roomBath', { bed: d?.bedrooms ?? 0, bath: d?.bathrooms ?? 0 }) : null
    return [
      { key: 'area', icon: ICONS.area, label: t('tenantPropertyDetail.badgeArea'), value: d?.size_sqm ? t('tenantPropertyDetail.areaValue', { area: d.size_sqm }) : t('tenantPropertyDetail.noValue') },
      { key: 'layout', icon: ICONS.layout, label: t('tenantPropertyDetail.badgeLayout'), value: layoutText || t('tenantPropertyDetail.noValue') },
      { key: 'floor', icon: ICONS.layers, label: t('tenantPropertyDetail.badgeFloor'), value: floorText || t('tenantPropertyDetail.noValue') },
      {
        key: 'type',
        icon: ICONS.tag,
        label: t('tenantPropertyDetail.badgeType'),
        value: PROPERTY_TYPE_LABEL[String(d?.property_type || '')] || t('tenantPropertyDetail.noValue'),
      },
      { key: 'furniture', icon: ICONS.sofa, label: t('tenantPropertyDetail.badgeFurniture'), value: d?.furnished ? t('tenantPropertyDetail.furnitureFull') : t('tenantPropertyDetail.furnitureNone') },
    ]
  }, [detail, t])

  const chips = useMemo(() => {
    const d = detail
    if (!d) return [] as string[]
    const list: string[] = []
    const typeLabel = PROPERTY_TYPE_LABEL[String(d.property_type || '')]
    if (typeLabel) list.push(typeLabel)
    if (d.furnished) list.push(t('tenantPropertyDetail.chipFurniture'))
    if (d.deposit_months) list.push(t('tenantPropertyDetail.chipDeposit', { deposit: d.deposit_months }))
    if (d.available_from) {
      const dt = dayjs(d.available_from)
      if (dt.isValid()) list.push(t('tenantPropertyDetail.chipAvailable', { date: dt.format(t('tenantDashboard.monthDayFormat')) }))
    }
    if (d.video_url) list.push(t('tenantPropertyDetail.chipVideo'))
    if (d.status === 'vacant') list.push(t('tenantPropertyDetail.chipViewNow'))
    return list
  }, [detail, t])

  const pois = useMemo(() => {
    if (!project) return [] as { key: string; icon: string; name: string; label: string }[]
    const list: { key: string; icon: string; name: string; label: string }[] = []
    if (project.nearest_subway) {
      list.push({ key: 'subway', icon: ICONS.subway, name: project.nearest_subway, label: t('tenantPropertyDetail.poiSubway') })
    }
    const region = [project.city, project.district].filter(Boolean).join(' · ')
    if (region) {
      list.push({ key: 'region', icon: ICONS.pin, name: region, label: t('tenantPropertyDetail.poiRegion') })
    }
    if (project.property_management_company) {
      list.push({
        key: 'pm',
        icon: ICONS.users,
        name: project.property_management_company,
        label: t('tenantPropertyDetail.poiPm'),
      })
    }
    return list
  }, [project, t])

  const buyPrice = Number(saleListing?.asking_price || 0)
  const buyCurrency = saleListing?.currency || currency
  const buyDown = buyPrice * (Number(loanDownPct || 0) / 100)
  const buyLoanAmount = Math.max(buyPrice - buyDown, 0)

  const loanResult = useMemo(() => {
    const principal = buyLoanAmount
    const months = Number(loanYears || 0) * 12
    const monthlyRate = Number(loanRate || 0) / 100 / 12
    if (!principal || months <= 0) return null
    if (monthlyRate <= 0) return { principal, months, monthly: null as number | null }
    const monthly = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
    return { principal, months, monthly }
  }, [buyLoanAmount, loanYears, loanRate])

  const handleToggleFavorite = async () => {
    if (!id || favBusy) return
    setFavBusy(true)
    const next = !favorited
    queryClient.setQueryData(['tenant-property-fav', id, uid], next)
    try {
      if (favorited) {
        await api.delete(`/favorites/${id}`)
        message.success(t('tenantPropertyDetail.unFavored'))
      } else {
        await api.post('/favorites', { property_id: id })
        message.success(t('tenantPropertyDetail.favored'))
      }
    } catch (err: any) {
      queryClient.setQueryData(['tenant-property-fav', id, uid], !next)
      message.error(err?.response?.data?.detail || t('tenantPropertyDetail.opFailed'))
    } finally {
      setFavBusy(false)
    }
  }

  const handleBooking = async () => {
    if (!id || !bookingAt) {
      message.warning(t('tenantPropertyDetail.warnViewingTime'))
      return
    }
    setBookingBusy(true)
    try {
      await api.post('/viewings', {
        property_id: id,
        scheduled_at: bookingAt.toISOString(),
        notes: bookingNote || null,
      })
      message.success(t('tenantPropertyDetail.bookedSubmitted'))
      setBookingOpen(false)
      setBookingAt(null)
      setBookingNote('')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('tenantPropertyDetail.submitFailed'))
    } finally {
      setBookingBusy(false)
    }
  }

  const handleTranslate = async () => {
    const source = detail?.description || ''
    if (!source) {
      message.warning(t('tenantPropertyDetail.warnTranslate'))
      return
    }
    setTranslating(true)
    try {
      const res = await api.post('/translate', { text: source, target: transTarget })
      const data = res.data?.data ?? res.data
      setTranslatedDesc(data?.translated_text || source)
    } catch {
      message.error(t('tenantPropertyDetail.translateFailed'))
    } finally {
      setTranslating(false)
    }
  }

  if (loading) {
    return <div className="rent-empty">{t('tenantPropertyDetail.loading')}</div>
  }

  if (!detail) {
    return (
      <>
        <nav className="rent-detail-crumb">
          <a onClick={() => navigate('/tenant/dashboard')}>{t('tenantPropertyDetail.crumbHome')}</a>
          <Icon d={ICONS.chevron} />
          <a onClick={() => navigate('/tenant/listings')}>{t('tenantPropertyDetail.crumbListings')}</a>
        </nav>
        <div className="rent-empty">{t('tenantPropertyDetail.emptyDetail')}</div>
      </>
    )
  }

  const displayName = detail.room_number || detail.address || t('tenantPropertyDetail.detailDefaultName')

  return (
    <>
      {/* 面包屑 */}
      <nav className="rent-detail-crumb" aria-label="面包屑">
        <a onClick={() => navigate('/tenant/dashboard')}>{t('tenantPropertyDetail.crumbHome')}</a>
        <Icon d={ICONS.chevron} />
        <a onClick={() => navigate('/tenant/listings')}>{t('tenantPropertyDetail.crumbListings')}</a>
        <Icon d={ICONS.chevron} />
        <span className="rent-detail-crumb__current">{displayName}</span>
      </nav>

      <div className="rent-detail-wrap">
        {/* 1 图集 */}
        <section className="rent-detail-card rent-detail-card--pad0 rent-detail-gallery">
          <div className="rent-detail-gallery__stage">
            <div className="rent-detail-gallery__art">
              {photos.length ? (
                <img src={photos[Math.min(photoIndex, photos.length - 1)]} alt={displayName} />
              ) : (
                <svg
                  className="rent-detail-gallery__building"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ICONS.building} />
                </svg>
              )}
            </div>
            {photos.length > 1 && (
              <span className="rent-detail-gallery__count">
                {Math.min(photoIndex, photos.length - 1) + 1}/{photos.length}
              </span>
            )}
            <span className="rent-detail-gallery__views">
              {detail.video_url && (
                <a
                  className="rent-detail-gallery__video"
                  href={detail.video_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon d={ICONS.play} /> {t('tenantPropertyDetail.videoTour')}
                </a>
              )}
            </span>
          </div>
          {photos.length > 1 && (
            <div className="rent-detail-gallery__thumbs">
              {photos.map((src, idx) => (
                <span
                  key={`${src}-${idx}`}
                  className="rent-detail-gallery__thumb"
                  data-active={idx === photoIndex}
                  style={{ backgroundImage: `url(${src})` }}
                  onClick={() => setPhotoIndex(idx)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 2 价格区（双业务） */}
        <section className="rent-detail-card rent-detail-price">
          <div className="rent-v17-tabs" role="tablist" aria-label="业务切换">
            <button
              className="rent-v17-tab"
              type="button"
              role="tab"
              data-active={biz === 'rent'}
              onClick={() => setBiz('rent')}
            >
              {t('tenantPropertyDetail.bizRent')}
            </button>
            <button
              className="rent-v17-tab"
              type="button"
              role="tab"
              data-active={biz === 'buy'}
              onClick={() => setBiz('buy')}
            >
              {t('tenantPropertyDetail.bizBuy')}
            </button>
          </div>

          <div className="rent-v17-pane" hidden={biz !== 'rent'}>
            <div className="rent-detail-price__row">
              <div>
                <div className="rent-detail-price__value">
                  {formatMoney(detail.monthly_rent, currency)}
                  <small>{t('tenantPropertyDetail.perMonth')}</small>
                </div>
                <div className="rent-detail-price__tags">
                  <span className="rent-badge rent-badge--primary">
                    {PROPERTY_TYPE_LABEL[String(detail.property_type || '')] || t('tenantPropertyDetail.inRent')}
                  </span>
                  <span className="rent-badge rent-badge--primary">
                    {detail.furnished ? t('tenantPropertyDetail.fullFurniture') : t('tenantPropertyDetail.selfFurniture')}
                  </span>
                </div>
              </div>
              {detail.status === 'vacant' && (
                <span className="rent-badge rent-badge--success">{t('tenantPropertyDetail.canView')}</span>
              )}
            </div>
            <h1 className="rent-detail-price__name">{displayName}</h1>
            <p className="rent-detail-price__addr">
              <Icon d={ICONS.pin} />
              {[detail.project_name, detail.address].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>

          <div className="rent-v17-pane" hidden={biz !== 'buy'}>
            {saleListing ? (
              <>
                <div className="rent-detail-price__row">
                  <div>
                    <div className="rent-detail-price__value rent-v17-price--buy">
                      {formatMoney(buyPrice, buyCurrency)}
                      <small>{t('tenantPropertyDetail.totalPrice')}</small>
                    </div>
                    <div className="rent-detail-price__tags">
                      <span className="rent-badge rent-badge--primary">{t('tenantPropertyDetail.available')}</span>
                      {saleListing.title && (
                        <span className="rent-badge rent-badge--primary">{saleListing.title}</span>
                      )}
                    </div>
                  </div>
                  <span className="rent-badge rent-badge--success">{t('tenantPropertyDetail.canView')}</span>
                </div>
                <div className="rent-v17-loan">
                  <span className="rent-v17-loan__item">{t('tenantPropertyDetail.downPayment', { pct: loanDownPct })}</span>
                  <span className="rent-v17-loan__sep">·</span>
                  <span className="rent-v17-loan__item">
                    {t('tenantPropertyDetail.loan')} <b>{formatMoney(buyLoanAmount, buyCurrency)}</b>
                  </span>
                  <span className="rent-v17-loan__sep">·</span>
                  <span className="rent-v17-loan__item">{t('tenantPropertyDetail.yearTerm', { years: loanYears })}</span>
                </div>
                <h2 className="rent-detail-price__name">
                  {saleListing.title || displayName}
                </h2>
                <p className="rent-detail-price__addr">
                  <Icon d={ICONS.pin} />
                  {saleListing.address || detail.address || '—'}
                </p>
              </>
            ) : (
              <div className="rent-empty">{t('tenantPropertyDetail.noSaleListing')}</div>
            )}
          </div>
        </section>

        {/* 3 核心信息 */}
        <section className="rent-detail-card">
          <div className="rent-detail-title">{t('tenantPropertyDetail.coreInfo')}</div>
          <div className="rent-detail-facts__grid">
            {facts.map((f) => (
              <div className="rent-detail-fact" key={f.key}>
                <span className="rent-detail-fact__icon">
                  <Icon d={f.icon} />
                </span>
                <div className="rent-detail-fact__value">{f.value}</div>
                <div className="rent-detail-fact__label">{f.label}</div>
              </div>
            ))}
          </div>
          {benchmark && (
            <div className="rent-v17-benchmark">
              <Icon d={ICONS.check} />
              {t('tenantPropertyDetail.avgPrice', {
                amount: formatMoney(benchmark.avg, benchmark.currency),
                rel: benchmark.lower ? t('tenantPropertyDetail.belowAvg') : t('tenantPropertyDetail.aboveAvg'),
                pct: benchmark.pct,
              })}
            </div>
          )}
        </section>

        {/* 4 卖点与基础配套 */}
        <section className="rent-detail-card">
          <div className="rent-detail-title">{t('tenantPropertyDetail.sellingPoints')}</div>
          {chips.length ? (
            <div className="rent-detail-chips">
              {chips.map((c) => (
                <span className="rent-detail-chip" key={c}>
                  <Icon d={ICONS.check} />
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <div className="rent-empty">{t('tenantPropertyDetail.emptyFacility')}</div>
          )}
        </section>

        {/* 5 房源描述与翻译 */}
        <section className="rent-detail-card">
          <div className="rent-detail-title">{t('tenantPropertyDetail.propertyDesc')}</div>
          {detail.description ? (
            <>
              <p className="rent-detail-desc">{translatedDesc || detail.description}</p>
              <div className="rent-detail-trans">
                <select
                  className="rent-pay-form-select"
                  style={{ maxWidth: 160 }}
                  value={transTarget}
                  onChange={(e) => setTransTarget(e.target.value)}
                >
                  <option value="zh">{t('language.zh')}</option>
                  <option value="en">{t('language.en')}</option>
                  <option value="th">{t('language.th')}</option>
                </select>
                <button
                  className="rent-btn rent-btn--ghost rent-btn--sm"
                  type="button"
                  disabled={translating}
                  onClick={handleTranslate}
                >
                  {translating ? t('tenantPropertyDetail.notTranslating') : t('tenantPropertyDetail.translateDesc')}
                </button>
                {translatedDesc && (
                  <button
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    type="button"
                    onClick={() => setTranslatedDesc(null)}
                  >
                    {t('tenantPropertyDetail.viewOriginal')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rent-empty">{t('tenantPropertyDetail.emptyDesc')}</div>
          )}
        </section>

        {/* 6 位置与周边 */}
        <section className="rent-detail-card">
          <div className="rent-detail-title">{t('tenantPropertyDetail.location')}</div>
          <div className="rent-detail-map__canvas">
            <svg
              className="rent-detail-map__pin"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" fill="#fff" stroke="#fff" />
            </svg>
            <span className="rent-detail-map__pin-label">
              {detail.project_name || detail.room_number}
            </span>
          </div>
          {pois.length ? (
            <div className="rent-detail-map__pois">
              {pois.map((p) => (
                <div className="rent-detail-poi" key={p.key}>
                  <span className="rent-detail-poi__icon">
                    <Icon d={p.icon} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="rent-detail-poi__name">{p.name}</div>
                    <div className="rent-detail-poi__dist">{p.label}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rent-empty">{t('tenantPropertyDetail.emptyPoi')}</div>
          )}
        </section>
      </div>

      {/* 7 底部固定操作栏 */}
      <div className="rent-detail-bar">
        <div className="rent-detail-bar__inner">
          <button
            className="rent-detail-bar__fav"
            type="button"
            aria-label="收藏"
            data-active={favorited}
            disabled={favBusy}
            onClick={handleToggleFavorite}
          >
            <Icon d={ICONS.heart} />
            <span>{favorited ? t('tenantPropertyDetail.favorited') : t('tenantPropertyDetail.addFavorite')}</span>
          </button>
          <button
            className="rent-btn rent-v17-bar__loan"
            type="button"
            hidden={biz !== 'buy' || !saleListing}
            onClick={() => setLoanOpen(true)}
          >
            {t('tenantPropertyDetail.calcLoan_placeholder')}
          </button>
          <button
            className="rent-btn rent-btn--primary rent-btn--lg rent-detail-bar__book"
            type="button"
            onClick={() => setBookingOpen(true)}
          >
            {t('tenantPropertyDetail.bookNow')}
          </button>
        </div>
      </div>

      {/* 预约看房 */}
      <Modal
        title={t('tenantPropertyDetail.bookModalTitle')}
        open={bookingOpen}
        onCancel={() => setBookingOpen(false)}
        onOk={handleBooking}
        okText={t('tenantPropertyDetail.submitBooking')}
        cancelText={t('common.cancel')}
        confirmLoading={bookingBusy}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, color: 'var(--rent-ink-2)', fontSize: 13 }}>
          {displayName}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.viewingTime')}
          </div>
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            value={bookingAt || undefined}
            disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))}
            onChange={(v) => setBookingAt(v)}
          />
        </div>
        <div>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.noteOptional')}
          </div>
          <Input.TextArea
            rows={3}
            value={bookingNote}
            onChange={(e) => setBookingNote(e.target.value)}
            placeholder={t('tenantPropertyDetail.notePlaceholder')}
          />
        </div>
      </Modal>

      {/* 贷款试算 */}
      <Modal
        title={t('tenantPropertyDetail.loanModalTitle')}
        open={loanOpen}
        onCancel={() => setLoanOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
              {t('tenantPropertyDetail.loanTotal')}
            </div>
            <div style={{ fontWeight: 600, color: 'var(--rent-ink)' }}>
              {formatMoney(buyPrice, buyCurrency)}
            </div>
          </div>
          <div>
            <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
              {t('tenantPropertyDetail.loanDownPct')}
            </div>
            <InputNumber
              min={0}
              max={100}
              style={{ width: '100%' }}
              value={loanDownPct}
              onChange={(v) => setLoanDownPct(Number(v ?? 0))}
            />
          </div>
          <div>
            <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
              {t('tenantPropertyDetail.loanYears')}
            </div>
            <InputNumber
              min={1}
              max={40}
              style={{ width: '100%' }}
              value={loanYears}
              onChange={(v) => setLoanYears(Number(v ?? 0))}
            />
          </div>
          <div>
            <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
              {t('tenantPropertyDetail.loanRate')}
            </div>
            <InputNumber
              min={0}
              max={30}
              step={0.1}
              style={{ width: '100%' }}
              value={loanRate ?? undefined}
              onChange={(v) => setLoanRate(v === null || v === undefined ? null : Number(v))}
              placeholder={t('tenantPropertyDetail.loanRatePlaceholder')}
            />
          </div>
          <div className="rent-v17-loan" style={{ marginTop: 0 }}>
            <span className="rent-v17-loan__item">
              {t('tenantPropertyDetail.downPaymentAmount')} <b>{formatMoney(buyDown, buyCurrency)}</b>
            </span>
            <span className="rent-v17-loan__sep">·</span>
            <span className="rent-v17-loan__item">
              {t('tenantPropertyDetail.loan')} <b>{formatMoney(buyLoanAmount, buyCurrency)}</b>
            </span>
            <span className="rent-v17-loan__sep">·</span>
            <span className="rent-v17-loan__item">
              {t('tenantPropertyDetail.monthlyPayment')}{' '}
              <b>
                {loanResult?.monthly
                  ? `${formatMoney(loanResult.monthly, buyCurrency)}${t('tenantPropertyDetail.perMonth')}`
                  : t('tenantPropertyDetail.waitRate')}
              </b>
            </span>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default TenantPropertyDetail