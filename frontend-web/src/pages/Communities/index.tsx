/**
 * 小区（楼盘）列表页。
 *
 * 楼盘字典的对外展示面。卡片带「售 N 间 / 租 N 间 + 价格区间」聚合——
 * 这是老站的做法，也是用户判断一个小区"有没有货"的最快方式。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Skeleton } from 'antd'
import api from '@/lib/api'
import { convertCurrency, formatMoney, loadRates } from '@/lib/money'
import PublicTopBar from '@/components/PublicTopBar'
import { tenureLabel } from '@/lib/publicLabels'
import '@/styles/public-site.css'

type ProjectCard = {
  id: string
  name?: string
  address?: string
  district?: string
  city?: string
  cover?: string
  total_units?: number
  completion_year?: number
  tenure?: string
  developer_name?: string
  sale_count?: number
  rent_count?: number
  sale_price_min?: number
  sale_price_max?: number
  rent_price_min?: number
  rent_price_max?: number
}

const priceRange = (min?: number, max?: number): string => {
  if (!min && !max) return ''
  if (min && max) {
    if (min === max) return formatMoney(min, 'THB')
    return `${formatMoney(min, 'THB')} - ${formatMoney(max, 'THB')}`
  }
  return formatMoney((min ?? max) as number, 'THB')
}

const CommunitiesPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [items, setItems] = useState<ProjectCard[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/public/projects', {
        params: { page_size: 60, q: keyword.trim() || undefined },
      })
      .then((res) => {
        if (!cancelled) setItems(res.data?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [keyword])

  return (
    <div className="pub-page">
      <PublicTopBar />

      <div className="pub-wrap">
        <div className="pub-section">
          <h1 className="pub-section__title">{t('publicSite.communitiesTitle')}</h1>
          <p className="pub-section__hint">{t('publicSite.communitiesHint')}</p>

          <div className="pub-filters">
            <div className="pub-field">
              <label className="pub-field__label" htmlFor="community-q">
                {t('common.search')}
              </label>
              <input
                id="community-q"
                className="pub-input"
                style={{ width: 240 }}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t('publicSite.communitySearchPlaceholder')}
              />
            </div>
          </div>

          {loading ? (
            <div className="pub-grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div className="pub-listing" key={n}>
                  <div className="pub-listing__media">
                    <Skeleton.Image active style={{ width: '100%', height: 170 }} />
                  </div>
                  <div className="pub-listing__body">
                    <Skeleton active paragraph={{ rows: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="pub-empty">{t('publicSite.communitiesEmpty')}</div>
          ) : (
            <div className="pub-grid">
              {items.map((project) => {
                const saleRange = priceRange(project.sale_price_min, project.sale_price_max)
                const rentRange = priceRange(project.rent_price_min, project.rent_price_max)
                return (
                  <article
                    key={project.id}
                    className="pub-listing"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/community/${project.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') navigate(`/community/${project.id}`)
                    }}
                  >
                    <div className="pub-listing__media">
                      {project.cover ? (
                        <img
                          className="pub-listing__img"
                          src={project.cover}
                          alt={project.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="pub-listing__placeholder">
                          {t('publicSite.noPhoto')}
                        </div>
                      )}
                    </div>

                    <div className="pub-listing__body">
                      <h3 className="pub-listing__title">{project.name}</h3>
                      <div className="pub-listing__meta">
                        {[project.district, project.city].filter(Boolean).join(' · ')}
                      </div>

                      <div className="pub-badge--row">
                        <span className="pub-badge pub-badge--primary">
                          {t('publicSite.saleCount', { count: project.sale_count ?? 0 })}
                        </span>
                        <span className="pub-badge">
                          {t('publicSite.rentCount', { count: project.rent_count ?? 0 })}
                        </span>
                        {project.tenure ? (
                          <span className="pub-badge">
                            {tenureLabel(project.tenure, t)}
                          </span>
                        ) : null}
                      </div>

                      {saleRange ? (
                        <div className="pub-listing__meta">
                          {t('publicSite.salePrice')}: {saleRange}
                          <span className="pub-listing__price-sub">
                            ≈ {formatMoney(convertCurrency(project.sale_price_min ?? 0, 'CNY'), 'CNY')}{t('publicSite.up')}
                          </span>
                        </div>
                      ) : null}
                      {rentRange ? (
                        <div className="pub-listing__meta">
                          {t('publicSite.rentPrice')}: {rentRange}
                          <span className="pub-listing__price-sub">{t('property.perMonth')}</span>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
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

export default CommunitiesPage
