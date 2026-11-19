/**
 * 地图找房（C 端公开页，免登录）——对齐贝壳地图找房。
 *
 * 布局：全屏 Google 地图（价格气泡）+ 顶部悬浮搜索/业务/筛选项 + 底部房源卡片横滑。
 * 交互：点气泡 → 选中并把卡片滚到对应位置；滑卡片 → 地图居中该房源。
 * 数据：`GET /public/map-points`，拖拽/缩放后按当前视野（min/max lat/lng）重新拉取。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { MAP_LIMIT } from '@/lib/pagination'
import { formatMoney } from '@/lib/money'
import { BANGKOK_CENTER } from '@/constants/location'
import PublicTopBar from '@/components/PublicTopBar'
import { useLocationStore } from '@/stores/location'
import { useDistricts } from '@/lib/publicDistricts'
import {
  RENT_PRICE_RANGES,
  SELL_PRICE_RANGES,
  rangeOptions,
} from '@/pages/category/categoryShared'
import MapCanvas, {
  type MapCanvasBounds,
  type MapCanvasFocus,
} from './MapCanvas'
import '@/styles/public-site.css'
import './index.css'

type BizKey = 'rent' | 'resale' | 'new' | 'office' | 'factory'
type TradeKey = 'rent' | 'sell'
type Panel = '' | 'region' | 'price' | 'bed'

interface MapPoint {
  id: string
  listing_type?: string
  property_type?: string
  is_new_development?: boolean
  room_number?: string
  address?: string
  price?: number
  monthly_rent?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  project_name?: string
  cover?: string
  lat?: number
  lng?: number
}

const BIZ_TABS: BizKey[] = ['rent', 'resale', 'new', 'office', 'factory']
const BIZ_LABEL_KEY: Record<BizKey, string> = {
  rent: 'mapFind.bizRent',
  resale: 'mapFind.bizResale',
  new: 'mapFind.bizNew',
  office: 'mapFind.bizOffice',
  factory: 'mapFind.bizFactory',
}

const BED_OPTIONS = ['', '1', '2', '3']

const pointName = (p: MapPoint): string => {
  if (p.project_name) return `${p.project_name}${p.room_number ? ` · ${p.room_number}` : ''}`
  return p.address || p.room_number || '—'
}

const pointPrice = (p: MapPoint): number => p.price ?? p.monthly_rent ?? 0

export default function MapFind() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)

  const [biz, setBiz] = useState<BizKey>('rent')
  const [trade, setTrade] = useState<TradeKey>('rent')
  const [district, setDistrict] = useState('')
  const [priceKey, setPriceKey] = useState('')
  const [bedKey, setBedKey] = useState('')
  const [panel, setPanel] = useState<Panel>('')

  const [searchInput, setSearchInput] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [bounds, setBounds] = useState<MapCanvasBounds | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cardIndex, setCardIndex] = useState(0)
  const [focus, setFocus] = useState<MapCanvasFocus | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const cardEls = useRef<Array<HTMLButtonElement | null>>([])
  const scrollTimer = useRef<number | null>(null)
  const suppressScrollUntil = useRef(0)
  const indexRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)

  // 业务 → 接口参数（listing_type / property_type / is_new_development）
  const bizParams = useMemo(() => {
    const params: Record<string, unknown> = {}
    if (biz === 'rent') {
      params.listing_type = 'rent'
    } else if (biz === 'resale') {
      params.listing_type = 'sell'
      params.is_new_development = false
    } else if (biz === 'new') {
      params.listing_type = 'sell'
      params.is_new_development = true
    } else if (biz === 'office') {
      params.listing_type = trade
      params.property_type = ['office', 'shop']
    } else {
      params.listing_type = trade
      params.property_type = ['factory']
    }
    return params
  }, [biz, trade])

  const listingType = (bizParams.listing_type as string) ?? 'rent'
  const propertyTypes = bizParams.property_type as string[] | undefined

  const districts = useDistricts({ city: cityKey, listingType, propertyTypes })

  const regionOptions = useMemo(
    () => [{ value: '', label: t('mapFind.any') }, ...districts.map((d) => ({ value: d.value, label: d.label }))],
    [districts, t],
  )

  const priceOptions = useMemo(
    () => [
      { value: '', label: t('mapFind.any') },
      ...rangeOptions(t, listingType === 'rent' ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
    ],
    [listingType, t],
  )

  const selectedPrice = priceOptions.find((o) => o.value === priceKey) ?? priceOptions[0]

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        limit: MAP_LIMIT,
        city: cityKey,
        ...bizParams,
      }
      if (district) params.district = district
      if (appliedKeyword.trim()) params.q = appliedKeyword.trim()
      if (priceKey) {
        const [min, max] = priceKey.split('-')
        if (min) params.price_min = Number(min)
        if (max) params.price_max = Number(max)
      }
      if (bedKey) params.bedrooms = Number(bedKey)
      if (bounds) {
        params.min_lat = bounds.min_lat
        params.max_lat = bounds.max_lat
        params.min_lng = bounds.min_lng
        params.max_lng = bounds.max_lng
      }
      const res = await api.get('/public/map-points', { params })
      const payload = res.data?.data ?? res.data
      const rows: MapPoint[] = Array.isArray(payload) ? payload : []
      setPoints(rows.filter((p) => !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng))))
      setFailed(false)
    } catch {
      setPoints([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [appliedKeyword, bedKey, bizParams, bounds, cityKey, district, priceKey])

  useEffect(() => {
    fetchPoints()
  }, [fetchPoints])

  // 视野变化 → 防抖后更新 bounds，避免拖拽过程中打出请求风暴
  const boundsTimer = useRef<number | null>(null)
  const onBoundsChanged = useCallback((b: MapCanvasBounds) => {
    if (boundsTimer.current) window.clearTimeout(boundsTimer.current)
    boundsTimer.current = window.setTimeout(() => setBounds(b), 400)
  }, [])
  useEffect(
    () => () => {
      if (boundsTimer.current) window.clearTimeout(boundsTimer.current)
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
    },
    [],
  )

  // 切换城市 / 业务时重置区域与选中态，避免跨城残留
  useEffect(() => {
    setDistrict('')
    setPanel('')
  }, [cityKey, biz])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // 点位刷新后保持选中合法：视野内没有当前房源就选中第一套（不主动移动地图）
  useEffect(() => {
    if (!points.length) {
      setSelectedId(null)
      setCardIndex(0)
      indexRef.current = 0
      return
    }
    if (!selectedIdRef.current || !points.some((p) => p.id === selectedIdRef.current)) {
      setSelectedId(points[0].id)
      setCardIndex(0)
      indexRef.current = 0
      listRef.current?.scrollTo({ left: 0 })
    }
  }, [points])

  const markers = useMemo(
    () =>
      points.map((p) => ({
        id: p.id,
        lat: Number(p.lat),
        lng: Number(p.lng),
        priceLabel: formatMoney(pointPrice(p), p.currency || 'THB'),
      })),
    [points],
  )

  const scrollToCard = (index: number) => {
    const container = listRef.current
    const el = cardEls.current[index]
    if (!container || !el) return
    suppressScrollUntil.current = Date.now() + 600
    container.scrollTo({
      left: el.offsetLeft - (container.clientWidth - el.clientWidth) / 2,
      behavior: 'smooth',
    })
  }

  const selectCard = useCallback(
    (index: number, scroll: boolean) => {
      const p = points[index]
      if (!p) return
      setSelectedId(p.id)
      selectedIdRef.current = p.id
      setCardIndex(index)
      indexRef.current = index
      setFocus({ lat: Number(p.lat), lng: Number(p.lng), ts: Date.now() })
      if (scroll) scrollToCard(index)
    },
    [points],
  )

  // 点气泡 → 选中并滚动卡片
  const selectFromMap = (id: string) => {
    const i = points.findIndex((p) => p.id === id)
    if (i >= 0) selectCard(i, true)
  }

  // 滑卡片 → 居中地图（滚动停止后判定当前居中的卡片）
  const onCardsScroll = () => {
    if (Date.now() < suppressScrollUntil.current) return
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      const container = listRef.current
      if (!container) return
      const center = container.scrollLeft + container.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      cardEls.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      if (best !== indexRef.current) selectCard(best, false)
    }, 140)
  }

  const chipLabel = (kind: Panel) => {
    if (kind === 'region') return district || t('mapFind.district')
    if (kind === 'price') return priceKey ? selectedPrice?.label ?? t('mapFind.price') : t('mapFind.price')
    if (!bedKey) return t('mapFind.bed')
    return bedKey === '3'
      ? t('mapFind.bed3plus')
      : `${bedKey}${t('category.bedroomUnit')}`
  }

  const panelOptions =
    panel === 'region' ? regionOptions : panel === 'price' ? priceOptions : []
  const panelKey = panel === 'region' ? district : priceKey
  const pickOption = (value: string) => {
    if (panel === 'region') setDistrict(value)
    if (panel === 'price') setPriceKey(value)
    setPanel('')
  }

  return (
    <div className="mf-page">
      <PublicTopBar />

      <div className="mf-stage">
        <MapCanvas
          center={BANGKOK_CENTER}
          points={markers}
          selectedId={selectedId}
          focus={focus}
          bottomInset={168}
          onSelect={selectFromMap}
          onBoundsChange={onBoundsChanged}
        />

        {/* 顶部悬浮：搜索 + 业务快选 + 区域/价格/户型下拉 */}
        <div className="mf-top">
          <div className="mf-top__row">
            <div className="mf-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setAppliedKeyword(searchInput)
                }}
                placeholder={t('mapFind.searchPlaceholder')}
                aria-label={t('mapFind.searchPlaceholder')}
              />
              {searchInput ? (
                <button
                  type="button"
                  className="mf-search__clear"
                  onClick={() => {
                    setSearchInput('')
                    setAppliedKeyword('')
                  }}
                  aria-label={t('common.reset')}
                >
                  ×
                </button>
              ) : null}
              <button type="button" className="mf-search__go" onClick={() => setAppliedKeyword(searchInput)}>
                {t('common.search')}
              </button>
            </div>

            <div className="mf-biz" role="tablist" aria-label={t('mapFind.title')}>
              {BIZ_TABS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={biz === k}
                  className={`mf-biz__item${biz === k ? ' mf-biz__item--on' : ''}`}
                  onClick={() => setBiz(k)}
                >
                  {t(BIZ_LABEL_KEY[k])}
                </button>
              ))}
            </div>
          </div>

          <div className="mf-top__row mf-top__row--selects">
            {(['region', 'price', 'bed'] as Panel[]).map((kind) => {
              const active = kind === 'region' ? !!district : kind === 'price' ? !!priceKey : !!bedKey
              return (
                <div key={kind} className="mf-select-wrap">
                  <button
                    type="button"
                    className={`mf-select${active ? ' mf-select--on' : ''}`}
                    onClick={() => setPanel(panel === kind ? '' : kind)}
                    aria-expanded={panel === kind}
                  >
                    <span>{chipLabel(kind)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {panel === kind ? (
                    <div className="mf-panel">
                      {kind === 'bed'
                        ? BED_OPTIONS.map((v) => (
                            <button
                              key={v || 'any'}
                              type="button"
                              className={`mf-panel__opt${bedKey === v ? ' mf-panel__opt--on' : ''}`}
                              onClick={() => {
                                setBedKey(v)
                                setPanel('')
                              }}
                            >
                              {v === ''
                                ? t('mapFind.any')
                                : v === '3'
                                  ? t('mapFind.bed3plus')
                                  : `${v}${t('category.bedroomUnit')}`}
                            </button>
                          ))
                        : panelOptions.map((o) => (
                            <button
                              key={o.value || 'any'}
                              type="button"
                              className={`mf-panel__opt${o.value === panelKey ? ' mf-panel__opt--on' : ''}`}
                              onClick={() => pickOption(o.value)}
                            >
                              {o.label}
                            </button>
                          ))}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {(biz === 'office' || biz === 'factory') && (
              <div className="mf-trade">
                {(['rent', 'sell'] as TradeKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`mf-trade__item${trade === k ? ' mf-trade__item--on' : ''}`}
                    onClick={() => setTrade(k)}
                  >
                    {k === 'rent' ? t('mapFind.bizRent') : t('browse.buy')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {panel ? <div className="mf-top__mask" onClick={() => setPanel('')} /> : null}
        </div>

        {/* 视野结果数 */}
        <div className="mf-count">
          {failed
            ? t('mapFind.loadError')
            : loading
              ? t('common.loading')
              : t('mapFind.pointCount', { n: points.length })}
        </div>

        {/* 底部卡片横滑：滑动即把地图居中到该房源 */}
        <div className="mf-cards" ref={listRef} onScroll={onCardsScroll}>
          {points.length ? (
            points.map((p, i) => {
              const isRent = p.listing_type === 'rent'
              return (
                <button
                  key={p.id}
                  type="button"
                  ref={(el) => {
                    cardEls.current[i] = el
                  }}
                  className={`mf-card${i === cardIndex ? ' mf-card--on' : ''}`}
                  onClick={() => navigate(`/listing/${p.id}`)}
                >
                  <div className="mf-card__media">
                    {p.cover ? (
                      <img src={p.cover} alt={pointName(p)} loading="lazy" />
                    ) : (
                      <span className="mf-card__noimg">{t('publicSite.noPhoto')}</span>
                    )}
                  </div>
                  <div className="mf-card__body">
                    <div className="mf-card__title">{pointName(p)}</div>
                    <div className="mf-card__facts">
                      {[
                        p.bedrooms != null ? `${p.bedrooms}${t('category.bedroomUnit')}` : '',
                        p.size_sqm != null ? `${p.size_sqm}${t('publicSite.sqm')}` : '',
                        p.address || '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="mf-card__bottom">
                      <span className="mf-card__price">
                        {formatMoney(pointPrice(p), p.currency || 'THB')}
                        {isRent ? (
                          <span className="mf-card__price-sub">{t('browse.rentUnit')}</span>
                        ) : null}
                      </span>
                      <span className="mf-card__more">{t('browse.viewDetail')}</span>
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="mf-empty">
              {loading ? t('common.loading') : failed ? t('mapFind.loadError') : t('mapFind.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
