/**
 * 小区详情页。
 *
 * 承载楼盘字典的完整参数（占地/户数/栋数/楼层/管理费/开发商/产权/外国人配额），
 * 并挂出该小区下的在售在租列表——字典存了不展示等于没存。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { convertCurrency, formatMoney, loadRates } from '@/lib/money'
import PublicTopBar from '@/components/PublicTopBar'
import PublicListingCard, { type PublicListingCardData } from '@/components/PublicListingCard'
import { tenureLabel } from '@/lib/publicLabels'
import '@/styles/public-site.css'

type ProjectDetail = {
  id: string
  name?: string
  address?: string
  district?: string
  city?: string
  lat?: number
  lng?: number
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
  amenities?: Record<string, unknown> | null
  payment_plan?: Record<string, unknown> | null
  sale_count?: number
  rent_count?: number
  sale_price_min?: number
  sale_price_max?: number
  rent_price_min?: number
  rent_price_max?: number
  listings?: PublicListingCardData[]
}

const CommunityDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api
      .get(`/public/projects/${id}`)
      .then((res) => {
        if (!cancelled) setProject(res.data)
      })
      .catch(() => {
        if (!cancelled) setProject(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="pub-page">
        <PublicTopBar />
        <div className="pub-loading">{t('common.loading')}</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="pub-page">
        <PublicTopBar />
        <div className="pub-empty">{t('publicSite.communityNotFound')}</div>
      </div>
    )
  }

  const listings = project.listings ?? []

  return (
    <div className="pub-page">
      <PublicTopBar />

      <div className="pub-wrap">
        <div className="pub-breadcrumb">
          <button
            type="button"
            className="pub-breadcrumb__link"
            onClick={() => navigate('/communities')}
          >
            {t('publicSite.navCommunities')}
          </button>
          <span>/</span>
          <span>{project.name}</span>
        </div>

        <div className="pub-section">
          <div className="pub-card">
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 8px' }}>
              {project.name}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--rent-ink-2)', margin: '0 0 14px' }}>
              {[project.address, project.district, project.city].filter(Boolean).join(' · ')}
            </p>

            <div className="pub-badge--row" style={{ marginBottom: 18 }}>
              <span className="pub-badge pub-badge--primary">
                {t('publicSite.saleCount', { count: project.sale_count ?? 0 })}
              </span>
              <span className="pub-badge">
                {t('publicSite.rentCount', { count: project.rent_count ?? 0 })}
              </span>
              {project.tenure ? (
                <span className="pub-badge">{tenureLabel(project.tenure, t)}</span>
              ) : null}
            </div>

            <div className="pub-kv">
              {project.developer_name ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.developer')}</span>
                  <span className="pub-kv__v">{project.developer_name}</span>
                </div>
              ) : null}
              {project.total_units ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.totalUnits')}</span>
                  <span className="pub-kv__v">{project.total_units}</span>
                </div>
              ) : null}
              {project.total_buildings ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.totalBuildings')}</span>
                  <span className="pub-kv__v">{project.total_buildings}</span>
                </div>
              ) : null}
              {project.total_floors ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.totalFloors')}</span>
                  <span className="pub-kv__v">{project.total_floors}</span>
                </div>
              ) : null}
              {project.parking_spaces ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.parkingSpaces')}</span>
                  <span className="pub-kv__v">{project.parking_spaces}</span>
                </div>
              ) : null}
              {project.completion_year ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.completionYear')}</span>
                  <span className="pub-kv__v">{project.completion_year}</span>
                </div>
              ) : null}
              {project.management_fee_per_sqm ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.managementFee')}</span>
                  <span className="pub-kv__v">
                    {project.management_fee_per_sqm} THB/{t('publicSite.sqm')}
                  </span>
                </div>
              ) : null}
              {project.avg_price ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.avgPrice')}</span>
                  <span className="pub-kv__v">
                    {formatMoney(project.avg_price, 'THB')}/{t('publicSite.sqm')}
                    <span className="pub-listing__price-sub">
                      ≈ {formatMoney(convertCurrency(project.avg_price, 'CNY'), 'CNY')}
                    </span>
                  </span>
                </div>
              ) : null}
              {project.foreign_quota_pct ? (
                <div className="pub-kv__item">
                  <span className="pub-kv__k">{t('publicSite.foreignQuota')}</span>
                  <span className="pub-kv__v">{project.foreign_quota_pct}%</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="pub-section">
            <h2 className="pub-section__title">{t('publicSite.communityListings')}</h2>
            <p className="pub-section__hint">{t('publicSite.communityListingsHint')}</p>
            {listings.length === 0 ? (
              <div className="pub-empty">{t('publicSite.communityListingsEmpty')}</div>
            ) : (
              <div className="pub-grid">
                {listings.map((item) => (
                  <PublicListingCard key={item.id} item={item} />
                ))}
              </div>
            )}
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

export default CommunityDetailPage
