/**
 * 地图找房（C 端公开页，免登录）。
 *
 * 数据面：`GET /public/map-points`（匿名可访问），仅返回所属楼盘维护了
 * 经纬度的房源。左侧为筛选 + 视野内房源列表，右侧为 Google Maps；
 * 拖拽/缩放地图后按当前视野（min/max lat/lng）重新拉取点位，
 * 避免一次性拉全城导致的请求风暴与无谓渲染。
 *
 * 业务口径与首页黄金导航 5 入口一致：
 * 租房=rent / 二手房=sell+非新房 / 新房=sell+新房 / 商铺办公=office|shop / 厂房=factory。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input, Select, Spin } from 'antd'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import GoogleMapView, { type MapMarker, type MapBounds } from '@/components/GoogleMap'
import PublicTopBar from '@/components/PublicTopBar'
import { useLocationStore } from '@/stores/location'
import { useDistricts } from '@/lib/publicDistricts'
import { RENT_PRICE_RANGES, SELL_PRICE_RANGES, rangeOptions } from '@/pages/category/categoryShared'
import '@/styles/public-site.css'

type BizKey = 'rent' | 'resale' | 'new' | 'office' | 'factory'
type TradeKey = 'rent' | 'sell'

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
  project_id?: string
  project_name?: string
  lat?: number
  lng?: number
}

// 地图默认中心（曼谷），与 PublicListings 口径一致，避免两处各写一份
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }

const BIZ_TABS: BizKey[] = ['rent', 'resale', 'new', 'office', 'factory']
const BIZ_LABEL_KEY: Record<BizKey, string> = {
  rent: 'mapFind.bizRent',
  resale: 'mapFind.bizResale',
  new: 'mapFind.bizNew',
  office: 'mapFind.bizOffice',
  factory: 'mapFind.bizFactory',
}

export default function MapFind() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)

  const [biz, setBiz] = useState<BizKey>('rent')
  const [trade, setTrade] = useState<TradeKey>('rent')
  const [district, setDistrict] = useState<string>('')
  const [priceRange, setPriceRange] = useState<string>('')
  const [keyword, setKeyword] = useState('')

  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [bounds, setBounds] = useState<MapBounds | null>(null)

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

  const districtOptions = useMemo(
    () => [{ value: '', label: t('browse.filterRegion') }].concat(
      districts.map((d) => ({ value: d.value, label: d.label })),
    ),
    [districts, t],
  )

  const priceOptions = useMemo(
    () => [{ value: '', label: t('browse.filterPrice') }].concat(
      rangeOptions(t, listingType === 'rent' ? RENT_PRICE_RANGES : SELL_PRICE_RANGES),
    ),
    [listingType, t],
  )

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { limit: 300, city: cityKey, ...bizParams }
      if (district) params.district = district
      if (keyword.trim()) params.q = keyword.trim()
      if (priceRange) {
        const [min, max] = priceRange.split('-')
        if (min) params.price_min = Number(min)
        if (max) params.price_max = Number(max)
      }
      if (bounds) {
        params.min_lat = bounds.minLat
        params.max_lat = bounds.maxLat
        params.min_lng = bounds.minLng
        params.max_lng = bounds.maxLng
      }
      const res = await api.get('/public/map-points', { params })
      const payload = res.data?.data ?? res.data
      setPoints(Array.isArray(payload) ? payload : [])
    } catch {
      setPoints([])
    } finally {
      setLoading(false)
    }
  }, [cityKey, bizParams, district, keyword, priceRange, bounds])

  useEffect(() => {
    fetchPoints()
  }, [fetchPoints])

  // 视野变化 → 防抖后更新 bounds，避免拖拽过程中打出请求风暴
  const boundsTimer = useRef<number | null>(null)
  const onBoundsChanged = useCallback((b: MapBounds) => {
    if (boundsTimer.current) window.clearTimeout(boundsTimer.current)
    boundsTimer.current = window.setTimeout(() => setBounds(b), 500)
  }, [])
  useEffect(
    () => () => {
      if (boundsTimer.current) window.clearTimeout(boundsTimer.current)
    },
    [],
  )

  // 切换城市 / 业务时重置区域，避免跨城的区域名残留
  useEffect(() => {
    setDistrict('')
  }, [cityKey, biz])

  const markers = useMemo<MapMarker[]>(
    () =>
      points
        .filter((p) => !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng)))
        .map((p) => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), title: pointName(p) })),
    [points],
  )

  const onMarkerClick = (m: MapMarker) => {
    if (m.id) navigate(`/listing/${m.id}`)
  }

  return (
    <div className="pub-page">
      <PublicTopBar />
      <div className="pub-wrap" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{t('mapFind.title')}</h1>
        <p style={{ color: 'var(--rent-ink-2)', fontSize: 13, margin: '0 0 16px' }}>
          {t('mapFind.subtitle')}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 340px) 1fr',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          {/* 左侧筛选 + 视野内房源 */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pub-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BIZ_TABS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBiz(k)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: '1px solid var(--rent-line)',
                      background: biz === k ? 'var(--rent-primary)' : 'var(--rent-card)',
                      color: biz === k ? 'var(--rent-primary-foreground)' : 'var(--rent-ink)',
                    }}
                  >
                    {t(BIZ_LABEL_KEY[k])}
                  </button>
                ))}
              </div>

              {/* 商办 / 厂房支持租售切换；其余业务已由 Tab 固定口径 */}
              {(biz === 'office' || biz === 'factory') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['rent', 'sell'] as TradeKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTrade(k)}
                      style={{
                        padding: '5px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: 'pointer',
                        border: '1px solid var(--rent-line)',
                        background: trade === k ? 'var(--rent-accent-soft)' : 'var(--rent-card)',
                        color: trade === k ? 'var(--rent-primary)' : 'var(--rent-ink-2)',
                      }}
                    >
                      {k === 'rent' ? t('mapFind.bizRent') : t('browse.buy')}
                    </button>
                  ))}
                </div>
              )}

              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('mapFind.searchPlaceholder')}
                allowClear
              />
              <Select
                value={district}
                onChange={setDistrict}
                options={districtOptions}
                style={{ width: '100%' }}
              />
              <Select
                value={priceRange}
                onChange={setPriceRange}
                options={priceOptions}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 12, color: 'var(--rent-ink-2)' }}>
                {t('mapFind.boundsHint')}
              </div>
            </div>

            <div className="pub-card" style={{ flex: 1, minHeight: 120 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{t('mapFind.listTitle')}</span>
                <span style={{ color: 'var(--rent-ink-2)', fontWeight: 400 }}>
                  {t('mapFind.pointCount', { n: points.length })}
                </span>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Spin />
                </div>
              ) : points.length === 0 ? (
                <div style={{ color: 'var(--rent-ink-2)', fontSize: 13, padding: '12px 0' }}>
                  {t('mapFind.empty')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {points.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(`/listing/${p.id}`)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--rent-line)',
                        background: 'var(--rent-card)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pointName(p)}</span>
                      <span style={{ fontSize: 13, color: 'var(--rent-primary)', fontWeight: 600 }}>
                        {formatMoney(pointPrice(p), p.currency)}
                        {p.listing_type === 'rent' ? t('browse.rentUnit') : ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--rent-ink-2)' }}>
                        {[
                          p.bedrooms != null ? `${p.bedrooms}${t('category.bedroomUnit')}` : '',
                          p.size_sqm != null ? `${p.size_sqm}㎡` : '',
                          p.address || '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* 右侧地图：按视野拉取点位 */}
          <div
            style={{
              position: 'relative',
              minHeight: 560,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--rent-line)',
            }}
          >
            <GoogleMapView
              center={DEFAULT_CENTER}
              zoom={12}
              markers={markers}
              onMarkerClick={onMarkerClick}
              onBoundsChanged={onBoundsChanged}
              mapContainerStyle={{ height: '100%', minHeight: 560 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function pointName(p: MapPoint): string {
  if (p.project_name) return `${p.project_name}${p.room_number ? ` · ${p.room_number}` : ''}`
  return p.address || p.room_number || '—'
}

function pointPrice(p: MapPoint): number {
  return p.monthly_rent ?? p.price ?? 0
}
