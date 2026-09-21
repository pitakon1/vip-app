/**
 * 学校详情页 + 该校周边在售/在租房源。
 *
 * 这是「学区找房」的真正入口：用户从「想让孩子上这所学校」出发反查房子，
 * 而不是从「筛一套房」出发。老站的学校页正是这么设计的，也是它自然搜索
 * 流量最值钱的一块。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { loadRates } from '@/lib/money'
import PublicTopBar from '@/components/PublicTopBar'
import PublicListingCard, { type PublicListingCardData } from '@/components/PublicListingCard'
import { curriculumLabel, schoolStageLabel, photoUrls } from '@/lib/publicLabels'
import '@/styles/public-site.css'

type SchoolDetail = {
  id: string
  name?: string
  name_en?: string
  stage?: string
  curriculum?: string
  district?: string
  city?: string
  address?: string
  lat?: number
  lng?: number
  student_count?: number
  age_range?: string
  tuition_range?: string
  phone?: string
  website?: string
  description?: string
  photos?: unknown[]
  nearby_listings?: PublicListingCardData[]
}

const SchoolDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ name: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  )

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api
      .get(`/public/schools/${id}`, { params: { radius_km: 5, limit: 12 } })
      .then((res) => {
        if (!cancelled) setSchool(res.data)
      })
      .catch(() => {
        if (!cancelled) setSchool(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const submitInquiry = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) {
      setFeedback({ tone: 'error', text: t('publicSite.inquireContactRequired') })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await api.post('/public/inquiries', {
        name: form.name,
        phone: form.phone,
        school_id: school?.id,
        message: t('publicSite.schoolInquiryMessage', { name: school?.name ?? '' }),
        source: 'school_detail',
      })
      setFeedback({ tone: 'ok', text: t('publicSite.inquireOk') })
      setForm({ name: '', phone: '' })
    } catch {
      setFeedback({ tone: 'error', text: t('publicSite.inquireError') })
    } finally {
      setSubmitting(false)
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

  if (!school) {
    return (
      <div className="pub-page">
        <PublicTopBar />
        <div className="pub-empty">{t('publicSite.schoolNotFound')}</div>
      </div>
    )
  }

  const photos = photoUrls(school.photos)
  const listings = school.nearby_listings ?? []

  return (
    <div className="pub-page">
      <PublicTopBar />

      <div className="pub-wrap">
        <div className="pub-breadcrumb">
          <button
            type="button"
            className="pub-breadcrumb__link"
            onClick={() => navigate('/schools')}
          >
            {t('publicSite.navSchools')}
          </button>
          <span>/</span>
          <span>{school.name}</span>
        </div>

        <div className="pub-section">
          <div className="pub-card">
            {photos.length > 0 ? (
              <img
                src={photos[0]}
                alt={school.name}
                style={{
                  width: '100%',
                  height: 260,
                  objectFit: 'cover',
                  borderRadius: 'var(--rent-radius-md)',
                  marginBottom: 16,
                }}
              />
            ) : null}

            <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 6px' }}>
              {school.name}
            </h1>
            {school.name_en ? (
              <p style={{ fontSize: 14, color: 'var(--rent-ink-2)', margin: '0 0 14px' }}>
                {school.name_en}
              </p>
            ) : null}

            <div className="pub-badge--row" style={{ marginBottom: 18 }}>
              {school.stage ? (
                <span className="pub-badge pub-badge--primary">
                  {schoolStageLabel(school.stage, t)}
                </span>
              ) : null}
              {school.curriculum ? (
                <span className="pub-badge">{curriculumLabel(school.curriculum, t)}</span>
              ) : null}
              {school.age_range ? <span className="pub-badge">{school.age_range}</span> : null}
              {school.tuition_range ? (
                <span className="pub-badge">{school.tuition_range}</span>
              ) : null}
            </div>

            <div className="pub-kv">
              {school.address ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.address')}</span>
                  <span className="pub-kv__v">{school.address}</span>
                </div>
              ) : null}
              {school.district || school.city ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.district')}</span>
                  <span className="pub-kv__v">
                    {[school.district, school.city].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ) : null}
              {school.student_count ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.studentCount')}</span>
                  <span className="pub-kv__v">{school.student_count}</span>
                </div>
              ) : null}
              {school.phone ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.phone')}</span>
                  <span className="pub-kv__v">{school.phone}</span>
                </div>
              ) : null}
              {school.website ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.website')}</span>
                  <span className="pub-kv__v">
                    <a href={school.website} target="_blank" rel="noreferrer">
                      {school.website}
                    </a>
                  </span>
                </div>
              ) : null}
            </div>

            {school.description ? (
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--rent-ink-2)',
                  whiteSpace: 'pre-wrap',
                  marginTop: 18,
                }}
              >
                {school.description}
              </p>
            ) : null}
          </div>

          {/* 周边房源：学区找房的落地点 */}
          <div className="pub-section">
            <h2 className="pub-section__title">{t('publicSite.nearbyListings')}</h2>
            <p className="pub-section__hint">{t('publicSite.nearbyListingsHint')}</p>
            {listings.length === 0 ? (
              <div className="pub-empty">{t('publicSite.nearbyListingsEmpty')}</div>
            ) : (
              <div className="pub-grid">
                {listings.map((item) => (
                  <PublicListingCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* 学校维度留资：用户可能对学校有兴趣但还没看中具体房源 */}
          <div className="pub-card" style={{ maxWidth: 520 }}>
            <form className="pub-inquiry" onSubmit={submitInquiry}>
              <h2 className="pub-inquiry__title">{t('publicSite.schoolInquireTitle')}</h2>
              <p className="pub-inquiry__note">{t('publicSite.inquireNote')}</p>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="school-inq-name">
                  {t('publicSite.inquireName')}
                </label>
                <input
                  id="school-inq-name"
                  className="pub-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="school-inq-phone">
                  {t('publicSite.inquirePhone')}
                </label>
                <input
                  id="school-inq-phone"
                  className="pub-input"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
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
                className="pub-btn pub-btn--primary pub-btn--block"
                disabled={submitting}
              >
                {submitting ? t('common.submitting') : t('publicSite.inquireSubmit')}
              </button>
            </form>
          </div>
        </div>
      </div>

      <footer className="pub-footer">
        <div className="pub-wrap">
          © {new Date().getFullYear()} HaoFang.World · {t('common.appName')}
        </div>
      </footer>
    </div>
  )
}

export default SchoolDetailPage
