/**
 * 公开房源详情页（免登录）。
 *
 * 这是"先浏览、后注册"链路里最重的一页：老站的房源详情页正是它的核心转化页
 * （房源编号 / 留资弹窗 / 经纪人卡片 / 学区距离全在这里）。而本站此前**根本
 * 没有公开详情路由**——未登录点房源卡片会被弹回列表，内容资产无处落地。
 *
 * 页面按「决策顺序」组织：价格 → 关键属性 → 小区 → **周边学校** → 描述 → 留资。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input, Modal, DatePicker, message as antdMessage } from 'antd'
import type { Dayjs } from 'dayjs'
import api from '@/lib/api'
import { convertCurrency, formatMoney, loadRates } from '@/lib/money'
import PublicTopBar from '@/components/PublicTopBar'
import useAuthStore from '@/stores/auth'
import { viewingsApi } from '@/services/api'
import {
  curriculumLabel,
  decorationLabel,
  orientationLabel,
  schoolStageLabel,
  tenureLabel,
  photoUrls,
} from '@/lib/publicLabels'
import '@/styles/public-site.css'

type NearbySchool = {
  id: string
  name?: string
  name_en?: string
  stage?: string
  curriculum?: string
  district?: string
  distance_km?: number
}

type ProjectBrief = {
  id?: string
  name?: string
  address?: string
  district?: string
  city?: string
  total_units?: number
  total_buildings?: number
  total_floors?: number
  parking_spaces?: number
  completion_year?: number
  management_fee_per_sqm?: number
  avg_price?: number
  tenure?: string
  foreign_quota_pct?: number
  developer_name?: string
  lat?: number
  lng?: number
}

type Broker = {
  company?: string
  real_name?: string
  phone?: string
  wechat?: string
  line?: string
  whatsapp?: string
}

type ListingDetail = {
  id: string
  property_id?: string
  listing_type?: string
  room_number?: string
  address?: string
  district?: string
  city?: string
  project_id?: string
  project_name?: string
  price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  floor?: number
  building?: string
  orientation?: string
  decoration?: string
  furnished?: boolean
  photos?: unknown[]
  video_url?: string
  listing_no?: string
  description?: string
  deposit_amount?: number
  deposit_months?: number
  lat?: number
  lng?: number
  project?: ProjectBrief
  nearby_schools?: NearbySchool[]
  broker?: Broker
}

const ListingDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const isLoggedIn = !!token

  const [detail, setDetail] = useState<ListingDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    wechat_id: '',
    email: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  )

  // 预约看房弹窗
  const [viewingOpen, setViewingOpen] = useState(false)
  const [viewingTime, setViewingTime] = useState<Dayjs | null>(null)
  const [viewingNote, setViewingNote] = useState('')
  const [viewingSubmitting, setViewingSubmitting] = useState(false)

  const openBooking = () => {
    if (!isLoggedIn) {
      antdMessage.info(t('publicSite.bookViewingLogin'))
      window.location.href = '/login'
      return
    }
    setViewingOpen(true)
  }

  // 汇率是双币展示的依赖，进页面先刷新一次（失败静默降级到内置兜底值）
  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api
      .get(`/public/listings/${id}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const photos = useMemo(() => photoUrls(detail?.photos), [detail?.photos])

  const isRent = detail?.listing_type === 'rent'
  const price = detail?.price ?? 0
  const priceCny = convertCurrency(price, 'CNY')

  const submitInquiry = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setFeedback({ tone: 'error', text: t('publicSite.inquireNameRequired') })
      return
    }
    if (!form.phone.trim()) {
      setFeedback({ tone: 'error', text: t('publicSite.inquirePhoneRequired') })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await api.post('/public/inquiries', {
        ...form,
        listing_id: detail?.id,
        project_id: detail?.project_id,
        source: 'listing_detail',
      })
      setFeedback({ tone: 'ok', text: t('publicSite.inquireOk') })
      setForm({ name: '', phone: '', wechat_id: '', email: '', message: '' })
    } catch {
      setFeedback({ tone: 'error', text: t('publicSite.inquireError') })
    } finally {
      setSubmitting(false)
    }
  }

  const submitBooking = async () => {
    if (!viewingTime) {
      antdMessage.warning(t('publicSite.bookTime'))
      return
    }
    setViewingSubmitting(true)
    try {
      await viewingsApi.create({
        property_id: detail?.property_id,
        scheduled_at: viewingTime.toISOString(),
        notes: viewingNote,
      })
      setViewingOpen(false)
      setViewingTime(null)
      setViewingNote('')
      antdMessage.success(t('publicSite.bookOk'))
    } catch (err: any) {
      antdMessage.error(err?.response?.data?.detail || t('publicSite.bookError'))
    } finally {
      setViewingSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="pub-page">
        <PublicTopBar />
        <div className="pub-loading">{t('common.loading')}</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="pub-page">
        <PublicTopBar />
        <div className="pub-empty">{t('publicSite.listingNotFound')}</div>
      </div>
    )
  }

  const title =
    detail.project_name ||
    detail.room_number ||
    detail.address ||
    t('publicSite.untitledListing')

  return (
    <div className="pub-page">
      <PublicTopBar />

      <div className="pub-wrap">
        <div className="pub-breadcrumb">
          <button
            type="button"
            className="pub-breadcrumb__link"
            onClick={() => navigate('/listings')}
          >
            {t('publicSite.backToList')}
          </button>
          <span>/</span>
          <span>{title}</span>
        </div>

        <div className="pub-detail">
          {/* ---------------- 主栏 ---------------- */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="pub-gallery">
              {photos.length === 0 ? (
                <div className="pub-gallery__empty">{t('publicSite.noPhoto')}</div>
              ) : (
                <>
                  <img className="pub-gallery__main" src={photos[0]} alt={title} />
                  <div className="pub-gallery__side">
                    {photos.slice(1, 3).map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt={title} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="pub-card">
              <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 8px' }}>{title}</h1>
              <p style={{ fontSize: 14, color: 'var(--rent-ink-2)', margin: '0 0 14px' }}>
                {[detail.address, detail.district, detail.city].filter(Boolean).join(' · ')}
              </p>

              <div className="pub-badge--row" style={{ marginBottom: 16 }}>
                <span className="pub-badge pub-badge--primary">
                  {isRent ? t('browse.rent') : t('browse.buy')}
                </span>
                {detail.bedrooms ? (
                  <span className="pub-badge">
                    {detail.bedrooms}
                    {t('browse.statBed')}
                  </span>
                ) : null}
                {detail.bathrooms ? (
                  <span className="pub-badge">
                    {detail.bathrooms}
                    {t('browse.statBath')}
                  </span>
                ) : null}
                {detail.size_sqm ? (
                  <span className="pub-badge">
                    {detail.size_sqm} {t('publicSite.sqm')}
                  </span>
                ) : null}
                {detail.furnished ? (
                  <span className="pub-badge">{t('browse.furnished')}</span>
                ) : null}
              </div>

              {/* 双币并排：中国客户对泰铢没有价格体感 */}
              <div className="pub-price-block">
                <span className="pub-price-block__main">
                  {formatMoney(price, detail.currency || 'THB')}
                </span>
                {isRent ? (
                  <span style={{ fontSize: 13, color: 'var(--rent-ink-3)' }}>
                    {t('property.perMonth')}
                  </span>
                ) : null}
                <span className="pub-price-block__alt">
                  ≈ {formatMoney(priceCny, 'CNY')}
                </span>
              </div>

              {detail.deposit_months ? (
                <p style={{ fontSize: 13, color: 'var(--rent-ink-2)', marginTop: 10 }}>
                  {t('publicSite.deposit')}: {detail.deposit_months}
                  {t('publicSite.months')}
                  {detail.deposit_amount
                    ? ` · ${formatMoney(detail.deposit_amount, detail.currency || 'THB')}`
                    : ''}
                </p>
              ) : null}
            </div>

            {/* 关键属性 */}
            <div className="pub-card">
              <h2 className="pub-section__title">{t('publicSite.keyFacts')}</h2>
              <div className="pub-kv" style={{ marginTop: 14 }}>
                {detail.room_number ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.roomNumber')}</span>
                    <span className="pub-kv__v">{detail.room_number}</span>
                  </div>
                ) : null}
                {detail.building ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.building')}</span>
                    <span className="pub-kv__v">{detail.building}</span>
                  </div>
                ) : null}
                {detail.floor !== null && detail.floor !== undefined ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.floor')}</span>
                    <span className="pub-kv__v">{detail.floor}</span>
                  </div>
                ) : null}
                {detail.orientation ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.orientationLabel')}</span>
                    <span className="pub-kv__v">
                      {orientationLabel(detail.orientation, t)}
                    </span>
                  </div>
                ) : null}
                {detail.decoration ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.decorationLabel')}</span>
                    <span className="pub-kv__v">
                      {decorationLabel(detail.decoration, t)}
                    </span>
                  </div>
                ) : null}
                {detail.listing_no ? (
                  <div className="pub-kv__item">
                    <span className="pub-kv__k">{t('publicSite.listingNo')}</span>
                    <span className="pub-kv__v">{detail.listing_no}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 小区信息块：楼盘字典的展示面 */}
            {detail.project ? (
              <div className="pub-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <h2 className="pub-section__title">{t('publicSite.communityInfo')}</h2>
                  {detail.project.id ? (
                    <button
                      type="button"
                      className="pub-btn"
                      onClick={() => navigate(`/community/${detail.project?.id}`)}
                    >
                      {t('publicSite.viewCommunity')}
                    </button>
                  ) : null}
                </div>
                <div className="pub-kv" style={{ marginTop: 14 }}>
                  {detail.project.name ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.communityName')}</span>
                      <span className="pub-kv__v">{detail.project.name}</span>
                    </div>
                  ) : null}
                  {detail.project.developer_name ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.developer')}</span>
                      <span className="pub-kv__v">{detail.project.developer_name}</span>
                    </div>
                  ) : null}
                  {detail.project.total_units ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.totalUnits')}</span>
                      <span className="pub-kv__v">{detail.project.total_units}</span>
                    </div>
                  ) : null}
                  {detail.project.total_floors ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.totalFloors')}</span>
                      <span className="pub-kv__v">{detail.project.total_floors}</span>
                    </div>
                  ) : null}
                  {detail.project.completion_year ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.completionYear')}</span>
                      <span className="pub-kv__v">{detail.project.completion_year}</span>
                    </div>
                  ) : null}
                  {detail.project.management_fee_per_sqm ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.managementFee')}</span>
                      <span className="pub-kv__v">
                        {detail.project.management_fee_per_sqm} THB/{t('publicSite.sqm')}
                      </span>
                    </div>
                  ) : null}
                  {detail.project.tenure ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.tenureLabel')}</span>
                      <span className="pub-kv__v">
                        {tenureLabel(detail.project.tenure, t)}
                      </span>
                    </div>
                  ) : null}
                  {detail.project.foreign_quota_pct ? (
                    <div className="pub-kv__item">
                      <span className="pub-kv__k">{t('publicSite.foreignQuota')}</span>
                      <span className="pub-kv__v">{detail.project.foreign_quota_pct}%</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* 周边学校：泰国买房的第一决策因子 */}
            {detail.nearby_schools && detail.nearby_schools.length > 0 ? (
              <div className="pub-card">
                <h2 className="pub-section__title">{t('publicSite.nearbySchools')}</h2>
                <p className="pub-section__hint">{t('publicSite.nearbySchoolsHint')}</p>
                <div className="pub-row-list">
                  {detail.nearby_schools.map((school) => (
                    <div
                      key={school.id}
                      className="pub-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/school/${school.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') navigate(`/school/${school.id}`)
                      }}
                    >
                      <div className="pub-row__main">
                        <h3 className="pub-row__title">{school.name}</h3>
                        <div className="pub-badge--row">
                          {school.stage ? (
                            <span className="pub-badge">
                              {schoolStageLabel(school.stage, t)}
                            </span>
                          ) : null}
                          {school.curriculum ? (
                            <span className="pub-badge">
                              {curriculumLabel(school.curriculum, t)}
                            </span>
                          ) : null}
                          {school.district ? (
                            <span className="pub-badge">{school.district}</span>
                          ) : null}
                        </div>
                      </div>
                      <span className="pub-row__distance">
                        {school.distance_km}
                        {t('publicSite.km')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {detail.description ? (
              <div className="pub-card">
                <h2 className="pub-section__title">{t('publicSite.description')}</h2>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: 'var(--rent-ink-2)',
                    whiteSpace: 'pre-wrap',
                    marginTop: 12,
                  }}
                >
                  {detail.description}
                </p>
              </div>
            ) : null}
          </main>

          {/* ---------------- 侧栏 ---------------- */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {detail.broker ? (
              <div className="pub-card">
                <h2 className="pub-inquiry__title">{t('publicSite.broker')}</h2>
                {!isLoggedIn ? (
                  <div
                    className="pub-form-msg"
                    style={{
                      marginTop: 10,
                      background: 'var(--rent-bg-2, #f5f6f7)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span role="img" aria-label="lock" style={{ fontSize: 13 }}>
                      🔒
                    </span>
                    <span>{t('publicSite.contactLocked')}</span>
                  </div>
                ) : null}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.broker.real_name ? (
                    <span style={{ fontSize: 15, fontWeight: 500 }}>
                      {detail.broker.real_name}
                    </span>
                  ) : null}
                  {detail.broker.company ? (
                    <span style={{ fontSize: 13, color: 'var(--rent-ink-2)' }}>
                      {detail.broker.company}
                    </span>
                  ) : null}
                  {detail.broker.phone ? (
                    <span style={{ fontSize: 14 }}>
                      {detail.broker.phone}
                      {!isLoggedIn ? (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--rent-ink-3)',
                            marginLeft: 6,
                          }}
                        >
                          {t('publicSite.lockedSuffix')}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {detail.broker.wechat ? (
                    <span style={{ fontSize: 13, color: 'var(--rent-ink-2)' }}>
                      WeChat: {detail.broker.wechat}
                    </span>
                  ) : null}
                  {detail.broker.line ? (
                    <span style={{ fontSize: 13, color: 'var(--rent-ink-2)' }}>
                      LINE: {detail.broker.line}
                    </span>
                  ) : null}
                  {detail.broker.whatsapp ? (
                    <span style={{ fontSize: 13, color: 'var(--rent-ink-2)' }}>
                      WhatsApp: {detail.broker.whatsapp}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* 预约看房：登录后可提交希望看房时间 */}
            <div className="pub-card">
              <button
                type="button"
                className="pub-btn pub-btn--primary pub-btn--block pub-btn--lg"
                onClick={openBooking}
              >
                {t('publicSite.bookViewing')}
              </button>
            </div>

            {/* 留资：匿名可提交。强制登录才能留资会显著降低转化——
                用户还没建立信任就先被要求注册，这是老站都不做的事。 */}
            <div className="pub-card">
              <form className="pub-inquiry" onSubmit={submitInquiry}>
                <h2 className="pub-inquiry__title">{t('publicSite.inquireTitle')}</h2>
                <p className="pub-inquiry__note">{t('publicSite.inquireNote')}</p>

                <div className="pub-field">
                  <label className="pub-field__label" htmlFor="inq-name">
                    {t('publicSite.inquireName')}
                  </label>
                  <input
                    id="inq-name"
                    className="pub-input"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </div>

                <div className="pub-field">
                  <label className="pub-field__label" htmlFor="inq-phone">
                    {t('publicSite.inquirePhone')}
                  </label>
                  <input
                    id="inq-phone"
                    className="pub-input"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </div>

                <div className="pub-field">
                  <label className="pub-field__label" htmlFor="inq-wechat">
                    {t('publicSite.inquireWechat')}
                  </label>
                  <input
                    id="inq-wechat"
                    className="pub-input"
                    value={form.wechat_id}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, wechat_id: event.target.value }))
                    }
                  />
                </div>

                <div className="pub-field">
                  <label className="pub-field__label" htmlFor="inq-message">
                    {t('publicSite.inquireMessage')}
                  </label>
                  <textarea
                    id="inq-message"
                    className="pub-input"
                    style={{ height: 84, paddingTop: 8, resize: 'vertical' }}
                    value={form.message}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                </div>

                {feedback ? (
                  <div
                    className={`pub-form-msg ${
                      feedback.tone === 'ok' ? 'pub-form-msg--ok' : 'pub-form-msg--error'
                    }`}
                  >
                    {feedback.text}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="pub-btn pub-btn--primary pub-btn--block pub-btn--lg"
                  disabled={submitting}
                >
                  {submitting ? t('common.submitting') : t('publicSite.inquireSubmit')}
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>

      <Modal
        title={t('publicSite.bookViewing')}
        open={viewingOpen}
        onCancel={() => setViewingOpen(false)}
        okText={t('publicSite.bookSubmit')}
        cancelText={t('common.cancel')}
        confirmLoading={viewingSubmitting}
        onOk={submitBooking}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
          <div className="pub-field" style={{ marginBottom: 0 }}>
            <label className="pub-field__label">{t('publicSite.bookTime')}</label>
            <DatePicker
              showTime
              style={{ width: '100%' }}
              value={viewingTime}
              onChange={(value) => setViewingTime(value)}
              placeholder={t('publicSite.bookTimePlaceholder')}
              format="YYYY-MM-DD HH:mm"
            />
          </div>
          <div className="pub-field" style={{ marginBottom: 0 }}>
            <label className="pub-field__label">{t('publicSite.bookNote')}</label>
            <Input.TextArea
              rows={3}
              value={viewingNote}
              onChange={(event) => setViewingNote(event.target.value)}
              placeholder={t('publicSite.bookNotePlaceholder')}
            />
          </div>
        </div>
      </Modal>

      <footer className="pub-footer">
        <div className="pub-wrap">
          © {new Date().getFullYear()} HaoFang.World · {t('common.appName')}
        </div>
      </footer>
    </div>
  )
}

export default ListingDetailPage
