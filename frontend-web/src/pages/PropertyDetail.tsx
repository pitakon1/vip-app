import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import type { CarouselRef } from 'antd/es/carousel'
import dayjs from 'dayjs'
import api from '@/lib/api'
import './PropertyDetail.css'

interface PropertyDetail {
  id: string
  room_number: string
  project_id: string
  project_name?: string
  owner_id?: string
  status: string
  monthly_rent: number
  currency?: string
  deposit_amount?: number
  deposit_months?: number
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
  orientation?: string
  decoration?: string
  furniture?: string
  available_date?: string
  created_at?: string
  published_at?: string
  images?: string[]
  amenities?: string[]
  [key: string]: any
}

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
]

const gradientFor = (seed: string, idx = 0) => {
  let h = idx
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return GRADIENTS[h % GRADIENTS.length]
}

const formatRent = (v: any) => `฿${Number(v || 0).toLocaleString()}`
const formatDate = (v?: string) => {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD') : '-'
}

const propertyTypeMap: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  villa: '别墅',
  house: '别墅',
  shop: '商铺',
  commercial: '商铺',
  office: '写字楼',
}

const statusLabelMap: Record<string, string> = {
  vacant: '空置中',
  rented: '已出租',
  reserved: '已预订',
  maintenance: '维护中',
}

const decorationLabelMap: Record<string, string> = {
  fine: '精装',
  deluxe: '精装',
  simple: '简装',
  rough: '毛坯',
}

const furnitureLabelMap: Record<string, string> = {
  full: '全配',
  partial: '部分',
  none: '无',
}

const DEFAULT_AMENITIES = [
  '空调',
  '热水器',
  '洗衣机',
  '冰箱',
  '电视',
  '网络',
  '停车位',
  '健身房',
  '游泳池',
  '24小时安保',
  '电梯',
  '花园',
]

// 租约状态文案
const leaseStatusMap: Record<string, string> = {
  active: '生效中',
  pending: '待生效',
  expired: '已到期',
  terminated: '已退租',
}

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const carouselRef = useRef<CarouselRef>(null)

  const [detail, setDetail] = useState<PropertyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [similar, setSimilar] = useState<PropertyDetail[]>([])
  const [leases, setLeases] = useState<any[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [favorited, setFavorited] = useState(false)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get(`/properties/${id}`)
      const payload = res.data?.data ?? res.data
      const data = payload?.data ?? payload
      setDetail(data as PropertyDetail)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取房源详情失败')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchSimilar = useCallback(async () => {
    try {
      const res = await api.get('/properties', {
        params: { page: 1, page_size: 8, limit: 8, status: 'vacant' },
      })
      const payload = res.data?.data ?? res.data
      const items: PropertyDetail[] = payload?.items ?? []
      setSimilar(items.filter((it) => String(it.id) !== String(id)).slice(0, 4))
    } catch {
      setSimilar([])
    }
  }, [id])

  const fetchLeases = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get(`/properties/${id}/leases`)
      const payload = res.data?.data ?? res.data
      setLeases(payload?.items ?? [])
    } catch {
      setLeases([])
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
    fetchSimilar()
    fetchLeases()
    setFavorited(false)
    setCurrentSlide(0)
    window.scrollTo?.({ top: 0 })
  }, [fetchDetail, fetchSimilar, fetchLeases, id])

  const slides = useMemo(() => {
    const roomNo = detail?.room_number || '—'
    const projectName = detail?.project_name || detail?.project_id || ''
    const count = detail?.images?.length || 4
    const arr = Array.from({ length: Math.max(count, 4) })
    return arr.map((_, idx) => ({
      key: idx,
      gradient: gradientFor(String(detail?.id || roomNo), idx),
      roomNo,
      projectName,
    }))
  }, [detail])

  const amenities = useMemo(() => {
    if (detail?.amenities && Array.isArray(detail.amenities) && detail.amenities.length) {
      return detail.amenities
    }
    return DEFAULT_AMENITIES
  }, [detail])

  const infoItems = useMemo(() => {
    if (!detail) return []
    const d = detail
    return [
      {
        label: '户型',
        value: `${d.bedrooms ?? 0}室${d.bathrooms ?? 0}卫`,
      },
      {
        label: '面积',
        value: `${Number(d.size_sqm || 0)}㎡`,
      },
      {
        label: '楼层',
        value: d.floor ? `${d.floor}层` : '-',
      },
      {
        label: '朝向',
        value: d.orientation || '-',
      },
      {
        label: '装修',
        value:
          decorationLabelMap[d.decoration || ''] || d.decoration || '-',
      },
      {
        label: '家具',
        value: d.furniture
          ? furnitureLabelMap[d.furniture] || d.furniture
          : d.furnished
            ? '全配'
            : '部分',
      },
      {
        label: '押金',
        value: d.deposit_months
          ? `${d.deposit_months}个月`
          : d.deposit_amount
            ? formatRent(d.deposit_amount)
            : '-',
      },
      {
        label: '可入住日期',
        value: formatDate(d.available_date),
      },
    ]
  }, [detail])

  const handleBook = () => {
    message.success('预约成功，经纪人将尽快联系您')
  }

  const handleFavorite = () => {
    setFavorited((v) => {
      message.success(v ? '已取消收藏' : '收藏成功')
      return !v
    })
  }

  const handleSimilarClick = (sid: string) => {
    navigate(`/properties/detail/${sid}`)
  }

  if (loading) {
    return <div className="rent-main"><div className="rent-empty">加载中...</div></div>
  }

  if (!detail) {
    return (
      <div className="rent-main">
        <button className="rent-back-link" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          返回房源列表
        </button>
        <div className="rent-empty">未找到该房源</div>
      </div>
    )
  }

  const projectName = detail.project_name || detail.project_id || ''
  const ptype =
    propertyTypeMap[detail.property_type || ''] || detail.property_type || '公寓'
  const statusKey = (detail.status || 'vacant').toLowerCase()
  const statusLabel = statusLabelMap[statusKey] || detail.status || '空置中'
  const statusBadgeClass =
    statusKey === 'rented'
      ? 'rent-badge--success'
      : statusKey === 'vacant'
        ? 'rent-badge--warning'
        : 'rent-badge--info'

  // 名称兜底：API 未返回时用项目名/房号，不再使用设计稿静态数据
  const displayName = projectName || (detail.room_number ? `${detail.room_number} 单元` : '房源详情')
  const displayAddress =
    detail.address || `${detail.city || ''} ${projectName}`.trim() || '—'
  const propNo = `PROP-2026-${String(id || '0000').padStart(4, '0').slice(-4)}`
  const monthlyRentText = formatRent(detail.monthly_rent ?? 0)
  const depositText = detail.deposit_amount ? formatRent(detail.deposit_amount) : '—'

  // 真实租约数据：当前生效租约 + 历史租约
  const currentLease = leases.find((l) => l.status === 'active') || null
  const historyLeases = leases.filter((l) => l.status !== 'active')
  const leaseStatusBadge = currentLease ? 'rent-badge--success' : 'rent-badge--neutral'
  const leaseStatusText = currentLease ? '生效中' : '无生效租约'
  const leaseStatusMapTxt = (st?: string) => (st ? leaseStatusMap[st] || st : '—')

  // 规格数据（设计稿：面积 / 卧室 / 卫浴 / 车位）
  const specArea = `${Number(detail.size_sqm || 1200).toLocaleString()} sqft`
  const specBedrooms = `${detail.bedrooms ?? 3} 间`
  const specBathrooms = `${detail.bathrooms ?? 2} 间`
  const specParking = '2 个'

  return (
    <div className="rent-main">
      {/* Back link */}
      <button className="rent-back-link" onClick={() => navigate(-1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        返回房源列表
      </button>

      {/* Property header card */}
      <div className="rent-card rent-mb-4">
        <div className="rent-card__body">
          <div className="rent-prop-header">
            {/* Property image placeholder (gradient) */}
            <div className="rent-prop-header__image">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            </div>
            {/* Property info */}
            <div className="rent-prop-header__info">
              <h2 className="rent-prop-header__name">{displayName}</h2>
              <div className="rent-prop-header__address">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {displayAddress}
              </div>
              <div className="rent-prop-header__badges">
                <span className="rent-badge rent-badge--primary">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                  {ptype}
                </span>
                <span className={`rent-badge ${statusBadgeClass}`}>
                  <span className="rent-badge--dot" style={{ background: 'currentColor' }} />
                  {statusLabel}
                </span>
                <span className="rent-badge rent-badge--neutral">编号 {propNo}</span>
              </div>

              {/* Key specs grid */}
              <div className="rent-spec-grid">
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">面积</div>
                  <div className="rent-spec-item__value">{specArea}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">卧室</div>
                  <div className="rent-spec-item__value">{specBedrooms}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">卫浴</div>
                  <div className="rent-spec-item__value">{specBathrooms}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">车位</div>
                  <div className="rent-spec-item__value">{specParking}</div>
                </div>
              </div>

              {/* Monthly rent + actions */}
              <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 4 }}>月租金</div>
                  <div>
                    <span className="rent-prop-rent">{monthlyRentText}</span>
                    <span className="rent-prop-rent__period">/月</span>
                  </div>
                </div>
                <div className="rent-prop-actions">
                  <button
                    className="rent-btn rent-btn--secondary"
                    onClick={handleFavorite}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    编辑信息
                  </button>
                  <button
                    className="rent-btn rent-btn--primary"
                    onClick={handleBook}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    新建合同
                  </button>
                  <button
                    className="rent-btn rent-btn--ghost"
                    onClick={() => navigate(`/properties`)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    返回列表
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout: Current lease + Owner info */}
      <div className="rent-grid rent-grid--2 rent-mb-4">
        {/* Current lease info */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">当前租约信息</h3>
            <span className={`rent-badge ${leaseStatusBadge}`}>
              <span className="rent-badge--dot" style={{ background: 'currentColor' }} />
              {leaseStatusText}
            </span>
          </div>
          <div className="rent-card__body">
            <dl className="rent-dl">
              <dt className="rent-dl__dt">租客</dt>
              <dd className="rent-dl__dd">{currentLease?.tenant_name || '—'}</dd>
              <dt className="rent-dl__dt">合同编号</dt>
              <dd className="rent-dl__dd rent-table__mono">
                {currentLease ? `LSE-${String(currentLease.id).slice(0, 8).toUpperCase()}` : '—'}
              </dd>
              <dt className="rent-dl__dt">租期</dt>
              <dd className="rent-dl__dd">
                {currentLease
                  ? `${formatDate(currentLease.start_date)} 至 ${formatDate(currentLease.end_date)}`
                  : '—'}
              </dd>
              <dt className="rent-dl__dt">月租</dt>
              <dd className="rent-dl__dd">
                {currentLease ? formatRent(currentLease.monthly_rent) : monthlyRentText}
              </dd>
              <dt className="rent-dl__dt">押金</dt>
              <dd className="rent-dl__dd">{depositText}</dd>
              <dt className="rent-dl__dt">状态</dt>
              <dd className="rent-dl__dd">
                <span className={`rent-badge ${leaseStatusBadge}`}>
                  <span className="rent-badge--dot" style={{ background: 'currentColor' }} />
                  {leaseStatusText}
                </span>
              </dd>
            </dl>
          </div>
        </div>

        {/* Owner info */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">业主信息</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-owner-head">
              <div className="rent-avatar rent-avatar--lg">
                {(detail.owner_name || '业').charAt(0)}
              </div>
              <div>
                <div className="rent-owner-head__name">{detail.owner_name || '—'}</div>
                <div className="rent-owner-head__sub">
                  {detail.owner_id ? `业主 · ${String(detail.owner_id).slice(0, 8).toUpperCase()}` : '—'}
                </div>
              </div>
            </div>

            <hr className="rent-divider" />

            <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 6 }}>收益分成</div>
            <div className="rent-flex rent-flex--between rent-gap-3">
              <div>
                <div className="rent-text-sm rent-text-muted">业主分成</div>
                <div className="rent-spec-item__value" style={{ color: 'var(--rent-primary)' }}>
                  {detail.owner_share != null ? `${detail.owner_share}%` : '—'}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">管理费</div>
                <div className="rent-spec-item__value">
                  {detail.mgmt_share != null ? `${detail.mgmt_share}%` : '—'}
                </div>
              </div>
            </div>
            <div className="rent-split-bar">
              <div className="rent-split-bar__owner" style={{ width: `${detail.owner_share ?? 100}%` }} />
              <div className="rent-split-bar__mgmt" style={{ width: `${detail.mgmt_share ?? 0}%` }} />
            </div>
            <div className="rent-split-legend">
              <span>业主 {formatRent(detail.owner_amount ?? 0)}</span>
              <span>管理 {formatRent(detail.mgmt_amount ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historical leases (full width) */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">历史租约</h3>
          <span className="rent-text-sm rent-text-muted">共 {historyLeases.length} 条记录</span>
        </div>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          {historyLeases.length === 0 ? (
            <div className="rent-loading-row">暂无历史租约</div>
          ) : (
            <table className="rent-table">
              <thead>
                <tr>
                  <th>合同编号</th>
                  <th>租客</th>
                  <th>租期</th>
                  <th>月租</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {historyLeases.map((r) => (
                  <tr key={r.id}>
                    <td className="rent-table__mono">{`LSE-${String(r.id).slice(0, 8).toUpperCase()}`}</td>
                    <td>{r.tenant_name || '—'}</td>
                    <td>{`${formatDate(r.start_date)} 至 ${formatDate(r.end_date)}`}</td>
                    <td>{formatRent(r.monthly_rent)}</td>
                    <td>
                      <span className="rent-badge rent-badge--neutral">
                        {leaseStatusMapTxt(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default PropertyDetail
