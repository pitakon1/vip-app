/**
 * 平台成交榜单 / 成交行情（C 端公开页）。
 *
 * 数据只来自 `GET /public/rankings`，仅聚合平台 `property_deals` 已完成样本；
 * 界面固定展示「平台样本 n=xx，非全市场」，样本不足时只显示提示、不编造排名。
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spin } from 'antd'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import PublicTopBar from '@/components/PublicTopBar'
import '@/styles/public-site.css'
import './index.css'

type Scope = 'project' | 'district'
type Metric = 'deal_count' | 'avg_price' | 'avg_psqm'

interface RankingItem {
  rank: number
  name: string
  district?: string | null
  deal_count: number
  avg_price?: number | null
  avg_psqm?: number | null
}

interface RankingData {
  days: number
  period: { start: string; end: string }
  sample_count: number
  min_sample: number
  published: boolean
  items: RankingItem[]
}

const SCOPES: Scope[] = ['project', 'district']
const METRICS: Metric[] = ['deal_count', 'avg_price', 'avg_psqm']

const asScope = (v: string | null): Scope => (v === 'district' ? 'district' : 'project')
const asMetric = (v: string | null): Metric =>
  v === 'avg_price' || v === 'avg_psqm' ? v : 'deal_count'

export default function Rankings() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [scope, setScope] = useState<Scope>(asScope(searchParams.get('scope')))
  const [metric, setMetric] = useState<Metric>(asMetric(searchParams.get('metric')))
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/public/rankings', {
        params: { scope, metric, days: 90, limit: 20 },
      })
      setData((res.data?.data ?? res.data) as RankingData)
    } catch {
      setError(t('category.rankings.loadError'))
    } finally {
      setLoading(false)
    }
  }, [scope, metric, t])

  useEffect(() => {
    void load()
  }, [load])

  // URL 同步：切换口径后刷新仍停留在同一个榜单
  const changeScope = (next: Scope) => {
    setScope(next)
    const params = new URLSearchParams(searchParams)
    params.set('scope', next)
    params.set('metric', metric)
    setSearchParams(params, { replace: true })
  }
  const changeMetric = (next: Metric) => {
    setMetric(next)
    const params = new URLSearchParams(searchParams)
    params.set('scope', scope)
    params.set('metric', next)
    setSearchParams(params, { replace: true })
  }

  const money = (v?: number | null) => formatMoney(v, 'THB')
  const metricLabel = () =>
    metric === 'deal_count'
      ? t('category.rankings.byCount')
      : metric === 'avg_price'
        ? t('category.rankings.avgPrice')
        : t('category.rankings.byPsqm')
  const metricValue = (item: RankingItem) =>
    metric === 'deal_count'
      ? t('category.rankings.deals', { n: item.deal_count })
      : metric === 'avg_price'
        ? money(item.avg_price)
        : money(item.avg_psqm)

  return (
    <div className="pub-page">
      <PublicTopBar />
      <main className="pub-wrap rankings">
        <h1 className="pub-section__title">{t('category.rankings.title')}</h1>

        <div className="rankings-tabs" role="tablist">
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'rankings-tab rankings-tab--on' : 'rankings-tab'}
              onClick={() => changeScope(s)}
            >
              {t(s === 'project' ? 'category.rankings.tabProject' : 'category.rankings.tabDistrict')}
            </button>
          ))}
        </div>

        <div className="rankings-chips">
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              className={metric === m ? 'rankings-chip rankings-chip--on' : 'rankings-chip'}
              onClick={() => changeMetric(m)}
            >
              {t(
                m === 'deal_count'
                  ? 'category.rankings.byCount'
                  : m === 'avg_price'
                    ? 'category.rankings.byPrice'
                    : 'category.rankings.byPsqm',
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rankings-state">
            <Spin />
          </div>
        ) : error ? (
          <div className="rankings-card">
            <p className="rankings-error">{error}</p>
            <button type="button" className="pub-btn pub-btn--primary" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        ) : data ? (
          <section className="rankings-card">
            <div className="rankings-head">
              <h2 className="rankings-title">{t('category.rankings.title')}</h2>
              <span className="rankings-caveat">
                {t('category.rankings.caveat', { n: data.sample_count })}
              </span>
            </div>
            <p className="rankings-period">
              {t('category.rankings.period', {
                days: data.days,
                start: data.period.start,
                end: data.period.end,
              })}
            </p>

            {!data.published ? (
              <p className="rankings-empty">
                {t('category.rankings.empty', { n: data.min_sample })}
              </p>
            ) : (
              <ol className="rankings-list">
                {data.items.map((item) => (
                  <li className="rankings-row" key={`${item.rank}-${item.name}`}>
                    <span className={item.rank <= 3 ? 'rankings-no rankings-no--top' : 'rankings-no'}>
                      {item.rank}
                    </span>
                    <div className="rankings-main">
                      <span className="rankings-name">{item.name}</span>
                      <span className="rankings-sub">
                        {item.district || '—'} · {t('category.rankings.deals', { n: item.deal_count })}
                      </span>
                    </div>
                    <div className="rankings-value-box">
                      <span className="rankings-value">{metricValue(item)}</span>
                      <span className="rankings-sub">{metricLabel()}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <p className="rankings-note">{t('category.rankings.note')}</p>
          </section>
        ) : null}
      </main>
    </div>
  )
}
