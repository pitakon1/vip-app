/**
 * 学校列表页（学区找房一级入口）。
 *
 * 泰国买房的第一决策因子是国际学校，这一页是它最值钱的自然搜索入口：
 * 用户按「阶段 / 课程体系 / 区域」找学校，再进学校页反查周边房源。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Skeleton } from 'antd'
import api from '@/lib/api'
import PublicTopBar from '@/components/PublicTopBar'
import { curriculumLabel, schoolStageLabel } from '@/lib/publicLabels'
import '@/styles/public-site.css'

type SchoolCard = {
  id: string
  name?: string
  name_en?: string
  stage?: string
  curriculum?: string
  district?: string
  city?: string
  address?: string
  student_count?: number
  tuition_range?: string
  age_range?: string
}

const STAGES = [
  'kindergarten',
  'primary',
  'secondary',
  'high_school',
  'university',
  'k12',
]

const CURRICULA = [
  'ib',
  'american',
  'british',
  'french',
  'german',
  'japanese',
  'thai',
  'bilingual',
  'other',
]

const SchoolsPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [items, setItems] = useState<SchoolCard[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [stage, setStage] = useState('')
  const [curriculum, setCurriculum] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/public/schools', {
        params: {
          page_size: 60,
          q: keyword.trim() || undefined,
          stage: stage || undefined,
          curriculum: curriculum || undefined,
        },
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
  }, [keyword, stage, curriculum])

  return (
    <div className="pub-page">
      <PublicTopBar />

      <div className="pub-wrap">
        <div className="pub-section">
          <h1 className="pub-section__title">{t('publicSite.schoolsTitle')}</h1>
          <p className="pub-section__hint">{t('publicSite.schoolsHint')}</p>

          <div className="pub-filters">
            <div className="pub-field">
              <label className="pub-field__label" htmlFor="school-q">
                {t('common.search')}
              </label>
              <input
                id="school-q"
                className="pub-input"
                style={{ width: 220 }}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t('publicSite.schoolSearchPlaceholder')}
              />
            </div>
            <div className="pub-field">
              <label className="pub-field__label" htmlFor="school-stage">
                {t('publicSite.stageLabel')}
              </label>
              <select
                id="school-stage"
                className="pub-select"
                value={stage}
                onChange={(event) => setStage(event.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {STAGES.map((value) => (
                  <option key={value} value={value}>
                    {schoolStageLabel(value, t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="pub-field">
              <label className="pub-field__label" htmlFor="school-curriculum">
                {t('publicSite.curriculumLabel')}
              </label>
              <select
                id="school-curriculum"
                className="pub-select"
                value={curriculum}
                onChange={(event) => setCurriculum(event.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {CURRICULA.map((value) => (
                  <option key={value} value={value}>
                    {curriculumLabel(value, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="pub-loading">
              <Skeleton active paragraph={{ rows: 1 }} />
              <Skeleton active paragraph={{ rows: 1 }} />
              <Skeleton active paragraph={{ rows: 1 }} />
            </div>
          ) : items.length === 0 ? (
            <div className="pub-empty">{t('publicSite.schoolsEmpty')}</div>
          ) : (
            <div className="pub-row-list">
              {items.map((school) => (
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
                    <h2 className="pub-row__title">{school.name}</h2>
                    <div className="pub-row__sub">
                      {[school.name_en, school.district, school.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="pub-badge--row">
                      {school.stage ? (
                        <span className="pub-badge">{schoolStageLabel(school.stage, t)}</span>
                      ) : null}
                      {school.curriculum ? (
                        <span className="pub-badge">
                          {curriculumLabel(school.curriculum, t)}
                        </span>
                      ) : null}
                      {school.age_range ? (
                        <span className="pub-badge">{school.age_range}</span>
                      ) : null}
                      {school.tuition_range ? (
                        <span className="pub-badge">{school.tuition_range}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="pub-row__distance">{t('publicSite.viewNearby')}</span>
                </div>
              ))}
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

export default SchoolsPage
