import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { translateApi, documentsApi } from '@/services/api'
import { useCachedQuery } from '@/lib/queryCache'
import { formatMoney } from '@/lib/money'
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

/**
 * 金额格式化：**跟随房源自身币种**，不再无条件写死 ฿。
 *
 * 此前是 `฿${...}`，而 `PropertyDetail` 接口是带 `currency` 字段的；
 * 一条 MYR 或 USD 计价的房源会被渲染成泰铢金额，是"数字对、币种错"的静默错误，
 * 比直接报错更难被用户发现。
 */
const formatRent = (v: any, currency?: string) =>
  formatMoney(Number(v || 0), currency || 'THB')

const formatDate = (v?: string) => {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD') : '-'
}

// 文档类型（后端 DocumentType 枚举）→ i18n key 与徽章色调。属于内部管理端术语，
// 与 C 端枚举不同，渲染处再走 t()。
const DOC_TYPE_LABEL: Record<string, string> = {
  contract: 'propertyDetail.docContract',
  receipt: 'propertyDetail.docReceipt',
  inspection_photo: 'propertyDetail.docInspectionPhoto',
  tax_invoice: 'propertyDetail.docTaxInvoice',
  wht_certificate: 'propertyDetail.docWhtCertificate',
  other: 'propertyDetail.docOther',
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
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  // ---- 枚举 → 文案：一律走 i18n ----
  // 此前 propertyType / propertyStatus / orientation / decoration 四组都是模块级
  // 硬编码中文常量，EN/TH 环境进入详情页会整屏漏翻（同文件其它文案早已接了 t()）。
  // 放到组件内经 useMemo 计算，语言切换时才会跟着刷新。
  const propertyTypeMap = useMemo<Record<string, string>>(() => ({
    apartment: t('propertyType.apartment'),
    condo: t('propertyType.condo'),
    villa: t('propertyType.villa'),
    house: t('propertyType.house'),
    shop: t('propertyType.shop'),
    commercial: t('propertyType.commercial'),
    office: t('propertyType.office'),
  }), [t])

  const statusLabelMap = useMemo<Record<string, string>>(() => ({
    vacant: t('propertyStatus.vacant'),
    rented: t('propertyStatus.rented'),
    reserved: t('propertyStatus.reserved'),
    maintenance: t('propertyStatus.maintenance'),
  }), [t])

  const leaseStatusMap = useMemo<Record<string, string>>(() => ({
    active: t('leaseStatus.active'),
    pending: t('leaseStatus.pending'),
    expired: t('leaseStatus.expired'),
    terminated: t('leaseStatus.terminated'),
  }), [t])

  // 未知枚举值回落为原始值（不显示成空），保证排障时能看见后端到底返回了什么。
  const orientationLabel = (v: string) =>
    t(`publicSite.orientation.${v}`, { defaultValue: v })
  const decorationLabel = (v: string) =>
    t(`publicSite.decoration.${v}`, { defaultValue: v })

  // v1.8 Google 翻译：房源描述可自行翻译
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [transTarget, setTransTarget] = useState('zh')

  // 房源详情（公开数据，缓存优先渲染 + 后台刷新）
  const detailQ = useCachedQuery<PropertyDetail | null>({
    queryKey: ['property-detail', id],
    cacheKey: `property-detail:${id}`,
    queryFn: async () => {
      if (!id) return null
      try {
        const res = await api.get(`/properties/${id}`)
        const payload = res.data?.data ?? res.data
        const data = payload?.data ?? payload
        return (data as PropertyDetail) ?? null
      } catch {
        return null
      }
    },
  })
  const detail = detailQ.data ?? null
  const loading = detailQ.isPending && !detailQ.data

  // 该房源租约（当前生效 + 历史）
  const leasesQ = useCachedQuery<any[]>({
    queryKey: ['property-leases', id],
    cacheKey: `property-leases:${id}`,
    queryFn: async () => {
      if (!id) return []
      try {
        const res = await api.get(`/properties/${id}/leases`)
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const leases = leasesQ.data ?? []

  // 该房源相关文档
  const docsQ = useCachedQuery<any[]>({
    queryKey: ['property-docs', id],
    cacheKey: `property-docs:${id}`,
    queryFn: async () => {
      if (!id) return []
      try {
        const res = await documentsApi.list({ property_id: id, page_size: 50 })
        const payload = res.data?.data ?? res.data
        const items = Array.isArray(payload) ? payload : (payload?.items ?? [])
        return items
      } catch {
        return []
      }
    },
  })
  const docs = docsQ.data ?? []

  const handleTranslate = async () => {
    const source = detail?.description || detail?.address || detail?.project_name || ''
    if (!source) {
      message.warning(t('propertyDetail.msgNoDesc'))
      return
    }
    setTranslating(true)
    try {
      const res = await translateApi.translate(source, transTarget)
      const data = res.data
      if (data.ok !== false && data.translated_text) {
        setTranslatedDesc(data.translated_text)
        message.success(t('propertyDetail.msgTranslated'))
      } else {
        setTranslatedDesc(data.translated_text || (data.message === '未配置密钥，返回原文本' ? source : t('propertyDetail.msgKeyMissing')))
      }
    } catch {
      message.error(t('propertyDetail.msgTranslateFailed'))
    } finally {
      setTranslating(false)
    }
  }

  // 打开文档：与业主文档页一致，带鉴权头走 /documents/{id}/file 取 blob 后新窗口预览
  const openDoc = async (doc: any) => {
    if (!doc?.id) {
      message.error(t('propertyDetail.msgFileMissing'))
      return
    }
    try {
      const res = await api.get(`/documents/${doc.id}/file`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data as Blob)
      window.open(blobUrl, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch {
      message.error(t('propertyDetail.msgOpenDocFailed'))
    }
  }

  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [id])

  if (loading) {
    return <div className="rent-main"><div className="rent-empty">{t('common.loading')}</div></div>
  }

  if (!detail) {
    return (
      <div className="rent-main">
        <button className="rent-back-link" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          {t('propertyDetail.backToList')}
        </button>
        <div className="rent-empty">{t('propertyDetail.notFound')}</div>
      </div>
    )
  }

  const projectName = detail.project_name || detail.project_id || ''
  // 房源自身币种：所有金额展示都跟随它（后端 currency 字段可能为 null，回落 THB）
  const currency = detail.currency || 'THB'
  const ptype =
    propertyTypeMap[detail.property_type || ''] || detail.property_type || t('propertyType.apartment')
  const statusKey = (detail.status || 'vacant').toLowerCase()
  const statusLabel = statusLabelMap[statusKey] || detail.status || t('propertyStatus.vacant')
  const statusBadgeClass =
    statusKey === 'rented'
      ? 'rent-badge--success'
      : statusKey === 'vacant'
        ? 'rent-badge--warning'
        : 'rent-badge--info'

  // 名称兜底：API 未返回时用项目名/房号，不再使用设计稿静态数据
  const displayName = projectName || (detail.room_number ? t('propertyDetail.unitSuffix', { n: detail.room_number }) : t('propertyDetail.title'))
  const displayAddress =
    detail.address || `${detail.city || ''} ${projectName}`.trim() || '—'
  const propNo = `PROP-2026-${String(id || '0000').padStart(4, '0').slice(-4)}`
  const monthlyRentText = formatRent(detail.monthly_rent ?? 0, currency)
  const depositText = detail.deposit_amount
    ? formatRent(detail.deposit_amount, currency)
    : '—'

  // 真实租约数据：当前生效租约 + 历史租约
  const currentLease = leases.find((l) => l.status === 'active') || null
  const historyLeases = leases.filter((l) => l.status !== 'active')
  const leaseStatusBadge = currentLease ? 'rent-badge--success' : 'rent-badge--neutral'
  const leaseStatusText = currentLease ? t('propertyDetail.leaseActive') : t('propertyDetail.noActiveLease')
  const leaseStatusMapTxt = (st?: string) => (st ? leaseStatusMap[st] || st : '—')

  // 规格数据（缺字段时显示 '—' 占位，面积按平方米展示）
  const specArea = detail.size_sqm != null ? `${Number(detail.size_sqm).toLocaleString()} ㎡` : '—'
  const specBedrooms = detail.bedrooms != null ? t('propertyDetail.roomCount', { n: detail.bedrooms }) : '—'
  const specBathrooms = detail.bathrooms != null ? t('propertyDetail.roomCount', { n: detail.bathrooms }) : '—'
  const specParking = detail.parking != null ? t('propertyDetail.parkingCount', { n: detail.parking }) : '—'
  const specOrientation = detail.orientation ? orientationLabel(detail.orientation) : '—'
  const specDecoration = detail.decoration ? decorationLabel(detail.decoration) : '—'
  const specUnitPrice =
    detail.monthly_rent && detail.size_sqm
      ? formatRent(Number(detail.monthly_rent) / Number(detail.size_sqm), currency)
      : '—'

  return (
    <div className="rent-main">
      {/* Back link */}
      <button className="rent-back-link" onClick={() => navigate(-1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        {t('propertyDetail.backToList')}
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
                  <span className="rent-badge rent-badge--info">{t('propertyDetail.videoTour')}</span>
                )}
                <span className="rent-badge rent-badge--neutral">{t('propertyDetail.propNoLabel', { no: propNo })}</span>
              </div>

              {/* Key specs grid */}
              <div className="rent-spec-grid">
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblArea')}</div>
                  <div className="rent-spec-item__value">{specArea}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblBedrooms')}</div>
                  <div className="rent-spec-item__value">{specBedrooms}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblBathrooms')}</div>
                  <div className="rent-spec-item__value">{specBathrooms}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblParking')}</div>
                  <div className="rent-spec-item__value">{specParking}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblOrientation')}</div>
                  <div className="rent-spec-item__value">{specOrientation}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblDecoration')}</div>
                  <div className="rent-spec-item__value">{specDecoration}</div>
                </div>
                <div className="rent-spec-item">
                  <div className="rent-spec-item__label">{t('propertyDetail.lblUnitPrice')}</div>
                  <div className="rent-spec-item__value">{specUnitPrice}{detail.monthly_rent && detail.size_sqm ? t('propertyDetail.perSqmMonth') : ''}</div>
                </div>
              </div>

              {/* Monthly rent + actions */}
              <div className="rent-flex rent-flex--between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 4 }}>{t('propertyDetail.lblMonthlyRent')}</div>
                  <div>
                    <span className="rent-prop-rent">{monthlyRentText}</span>
                    <span className="rent-prop-rent__period">{t('propertyDetail.perMonth')}</span>
                  </div>
                </div>
                <div className="rent-prop-actions">
                  <button
                    className="rent-btn rent-btn--secondary"
                    onClick={() => navigate('/properties')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    {t('propertyDetail.btnEdit')}
                  </button>
                  <button
                    className="rent-btn rent-btn--primary"
                    onClick={() => navigate('/leases')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    {t('propertyDetail.btnNewContract')}
                  </button>
                  <button
                    className="rent-btn rent-btn--ghost"
                    onClick={() => navigate('/leases')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    {t('propertyDetail.btnViewDocs')}
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
            <h3 className="rent-card__title">{t('propertyDetail.currentLeaseTitle')}</h3>
            <span className={`rent-badge ${leaseStatusBadge}`}>
              <span className="rent-badge--dot" style={{ background: 'currentColor' }} />
              {leaseStatusText}
            </span>
          </div>
          <div className="rent-card__body">
            <dl className="rent-dl">
              <dt className="rent-dl__dt">{t('propertyDetail.lblTenant')}</dt>
              <dd className="rent-dl__dd">{currentLease?.tenant_name || '—'}</dd>
              <dt className="rent-dl__dt">{t('propertyDetail.lblContractNo')}</dt>
              <dd className="rent-dl__dd rent-table__mono">
                {currentLease ? `LSE-${String(currentLease.id).slice(0, 8).toUpperCase()}` : '—'}
              </dd>
              <dt className="rent-dl__dt">{t('propertyDetail.lblLeaseTerm')}</dt>
              <dd className="rent-dl__dd">
                {currentLease
                  ? t('propertyDetail.dateRange', { a: formatDate(currentLease.start_date), b: formatDate(currentLease.end_date) })
                  : '—'}
              </dd>
              <dt className="rent-dl__dt">{t('propertyDetail.lblMonthlyRentShort')}</dt>
              <dd className="rent-dl__dd">
                {currentLease ? formatRent(currentLease.monthly_rent) : monthlyRentText}
              </dd>
              <dt className="rent-dl__dt">{t('propertyDetail.lblDeposit')}</dt>
              <dd className="rent-dl__dd">{depositText}</dd>
              <dt className="rent-dl__dt">{t('common.status')}</dt>
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
            <h3 className="rent-card__title">{t('propertyDetail.ownerInfoTitle')}</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-owner-head">
              <div className="rent-avatar rent-avatar--lg">
                {(detail.owner_name || t('propertyDetail.ownerInitial')).charAt(0)}
              </div>
              <div>
                <div className="rent-owner-head__name">{detail.owner_name || '—'}</div>
                <div className="rent-owner-head__sub">
                  {detail.owner_id ? t('propertyDetail.ownerIdPrefix', { id: String(detail.owner_id).slice(0, 8).toUpperCase() }) : '—'}
                </div>
              </div>
            </div>

            <hr className="rent-divider" />

            <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 6 }}>{t('propertyDetail.revenueSplit')}</div>
            <div className="rent-flex rent-flex--between rent-gap-3">
              <div>
                <div className="rent-text-sm rent-text-muted">{t('propertyDetail.ownerShareLabel')}</div>
                <div className="rent-spec-item__value" style={{ color: 'var(--rent-primary)' }}>
                  {detail.owner_share != null ? `${detail.owner_share}%` : '—'}
                </div>
              </div>
              <div>
                <div className="rent-text-sm rent-text-muted">{t('propertyDetail.mgmtFeeLabel')}</div>
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
              <span>{t('propertyDetail.ownerLegend', { amt: formatRent(detail.owner_amount ?? 0) })}</span>
              <span>{t('propertyDetail.mgmtLegend', { amt: formatRent(detail.mgmt_amount ?? 0) })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 房源描述 + Google 翻译按钮 */}
      <div className="rent-card rent-mb-4">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('propertyDetail.descTitle')}</h3>
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
              {translating ? t('propertyDetail.translating') : t('propertyDetail.googleTranslate')}
            </button>
          </div>
        </div>
        <div className="rent-card__body">
          <div className="rent-text-muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {translatedDesc || detail.description || (detail.address ? detail.address : t('propertyDetail.noDescHint'))}
          </div>
          {translatedDesc && detail.description && (
            <div className="rent-text-sm rent-text-muted rent-mt-2" style={{ borderTop: '1px solid var(--rent-line)', paddingTop: 8 }}>
              {t('propertyDetail.originalLabel')}{detail.description}
            </div>
          )}
        </div>
      </div>

      {/* 相关文档 */}
      <div className="rent-card rent-mb-4">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('propertyDetail.docsTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('propertyDetail.docsCount', { n: docs.length })}</span>
        </div>
        <div className="rent-card__body">
          {docs.length === 0 ? (
            <div className="rent-text-muted" style={{ padding: '8px 0' }}>{t('propertyDetail.noDocs')}</div>
          ) : (
            <div className="rent-doc-list">
              {docs.map((d) => (
                <div className="rent-doc-row" key={d.id}>
                  <div className="rent-doc-row__main">
                    <div className="rent-doc-row__name">{d.title || d.name || t('propertyDetail.untitledDoc')}</div>
                    <div className="rent-doc-row__meta">
                      <span className={`rent-badge ${DOC_TYPE_BADGE[d.type] || 'rent-badge--neutral'}`}>
                        {DOC_TYPE_LABEL[d.type] ? t(DOC_TYPE_LABEL[d.type]) : t('propertyDetail.docOther')}
                      </span>
                      <span>{d.created_at ? formatDate(d.created_at) : ''}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    onClick={() => openDoc(d)}
                  >
                    {t('propertyDetail.btnView')}
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
          <h3 className="rent-card__title">{t('propertyDetail.historyTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('propertyDetail.historyCount', { n: historyLeases.length })}</span>
        </div>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          {historyLeases.length === 0 ? (
            <div className="rent-loading-row">{t('propertyDetail.noHistory')}</div>
          ) : (
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('propertyDetail.lblContractNo')}</th>
                  <th>{t('propertyDetail.lblTenant')}</th>
                  <th>{t('propertyDetail.lblLeaseTerm')}</th>
                  <th>{t('propertyDetail.lblMonthlyRentShort')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {historyLeases.map((r) => (
                  <tr key={r.id}>
                    <td className="rent-table__mono">{`LSE-${String(r.id).slice(0, 8).toUpperCase()}`}</td>
                    <td>{r.tenant_name || '—'}</td>
                    <td>{t('propertyDetail.dateRange', { a: formatDate(r.start_date), b: formatDate(r.end_date) })}</td>
                    <td>{formatRent(r.monthly_rent, r.currency || currency)}</td>
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
