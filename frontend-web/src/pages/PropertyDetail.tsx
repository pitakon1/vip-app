import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { translateApi, documentsApi } from '@/services/api'
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
  video_url?: string
  [key: string]: any
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

// 租约状态文案
const leaseStatusMap: Record<string, string> = {
  active: '生效中',
  pending: '待生效',
  expired: '已到期',
  terminated: '已退租',
}

// 文档类型（后端 DocumentType 枚举）→ 展示文案与徽章色调
const DOC_TYPE_LABEL: Record<string, string> = {
  contract: '合同',
  receipt: '收据',
  inspection_photo: '验房照片',
  tax_invoice: '税务发票',
  wht_certificate: '预扣税证明',
  other: '其他',
}
const DOC_TYPE_BADGE: Record<string, string> = {
  contract: 'rent-badge--primary',
  receipt: 'rent-badge--success',
  inspection_photo: 'rent-badge--info',
  tax_invoice: 'rent-badge--warning',
  wht_certificate: 'rent-badge--warning',
  other: 'rent-badge--neutral',
}

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<PropertyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [leases, setLeases] = useState<any[]>([])
  const [docs, setDocs] = useState<any[]>([])
  // v1.8 Google 翻译：房源描述可自行翻译
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [transTarget, setTransTarget] = useState('zh')

  const handleTranslate = async () => {
    const source = detail?.description || detail?.address || detail?.project_name || ''
    if (!source) {
      message.warning('暂无可翻译的房源描述文本')
      return
    }
    setTranslating(true)
    try {
      const res = await translateApi.translate(source, transTarget)
      const data = res.data
      if (data.ok !== false && data.translated_text) {
        setTranslatedDesc(data.translated_text)
        message.success('翻译完成')
      } else {
        setTranslatedDesc(data.translated_text || (data.message === '未配置密钥，返回原文本' ? source : '翻译服务未配置密钥，返回原文'))
      }
    } catch {
      message.error('翻译失败')
    } finally {
      setTranslating(false)
    }
  }

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

  const fetchDocs = useCallback(async () => {
    if (!id) return
    try {
      const res = await documentsApi.list({ property_id: id, page_size: 50 })
      const payload = res.data?.data ?? res.data
      const items = Array.isArray(payload) ? payload : (payload?.items ?? [])
      setDocs(items)
    } catch {
      setDocs([])
    }
  }, [id])

  // 打开文档：与业主文档页一致，带鉴权头走 /documents/{id}/file 取 blob 后新窗口预览
  const openDoc = async (doc: any) => {
    if (!doc?.id) {
      message.error('文件地址不存在')
      return
    }
    try {
      const res = await api.get(`/documents/${doc.id}/file`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data as Blob)
      window.open(blobUrl, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch {
      message.error('打开文档失败')
    }
  }

  useEffect(() => {
    fetchDetail()
    fetchLeases()
    fetchDocs()
    window.scrollTo?.({ top: 0 })
  }, [fetchDetail, fetchLeases, fetchDocs, id])

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
            {/* 有看房视频时直接播放，否则退回占位图 */}
            {detail.video_url ? (
              <video
                className="rent-prop-header__image rent-prop-video"
                src={detail.video_url}
                controls
                preload="metadata"
              />
            ) : (
              <div className="rent-prop-header__image">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              </div>
            )}
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
                {detail.video_url && (
                  <span className="rent-badge rent-badge--info">视频看房</span>
                )}
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
                    onClick={() => navigate('/properties')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    编辑信息
                  </button>
                  <button
                    className="rent-btn rent-btn--primary"
                    onClick={() => navigate('/leases')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    新建合同
                  </button>
                  <button
                    className="rent-btn rent-btn--ghost"
                    onClick={() => navigate('/leases')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    查看文档
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

      {/* 房源描述 + Google 翻译按钮 */}
      <div className="rent-card rent-mb-4">
        <div className="rent-card__header">
          <h3 className="rent-card__title">房源描述</h3>
          <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
            <select
              className="rent-input"
              style={{ width: 120, padding: '4px 8px' }}
              value={transTarget}
              onChange={(e) => setTransTarget(e.target.value)}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="th">ไทย</option>
            </select>
            <button
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={handleTranslate}
              disabled={translating}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}>
                <path d="M23 5l-7 14M17 5l-7 14M8 9l-5 6M7 15H2M19 9h4" />
              </svg>
              {translating ? '翻译中...' : 'Google 翻译'}
            </button>
          </div>
        </div>
        <div className="rent-card__body">
          <div className="rent-text-muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {translatedDesc || detail.description || (detail.address ? detail.address : '暂无描述，可点击右上角「Google 翻译」翻译地址或描述文本。')}
          </div>
          {translatedDesc && detail.description && (
            <div className="rent-text-sm rent-text-muted rent-mt-2" style={{ borderTop: '1px solid var(--rent-line)', paddingTop: 8 }}>
              原文：{detail.description}
            </div>
          )}
        </div>
      </div>

      {/* 相关文档 */}
      <div className="rent-card rent-mb-4">
        <div className="rent-card__header">
          <h3 className="rent-card__title">相关文档</h3>
          <span className="rent-text-sm rent-text-muted">共 {docs.length} 份</span>
        </div>
        <div className="rent-card__body">
          {docs.length === 0 ? (
            <div className="rent-text-muted" style={{ padding: '8px 0' }}>暂无相关文档</div>
          ) : (
            <div className="rent-doc-list">
              {docs.map((d) => (
                <div className="rent-doc-row" key={d.id}>
                  <div className="rent-doc-row__main">
                    <div className="rent-doc-row__name">{d.title || d.name || '未命名文档'}</div>
                    <div className="rent-doc-row__meta">
                      <span className={`rent-badge ${DOC_TYPE_BADGE[d.type] || 'rent-badge--neutral'}`}>
                        {DOC_TYPE_LABEL[d.type] || '其他'}
                      </span>
                      <span>{d.created_at ? formatDate(d.created_at) : ''}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    onClick={() => openDoc(d)}
                  >
                    查看
                  </button>
                </div>
              ))}
            </div>
          )}
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
