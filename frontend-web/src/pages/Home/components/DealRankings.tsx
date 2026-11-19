/**
 * 首页「平台成交榜单」。
 *
 * 数据来自后端 `/public/rankings`（仅聚合 `property_deals` 中已完成的平台成交），
 * 不是全市场数据；样本量必须原样展示，低于阈值时后端不发布榜单，这里只显示提示。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

type RankingItem = {
  rank: number
  name: string
  district?: string | null
  deal_count: number
  avg_price?: number | null
  avg_psqm?: number | null
  value: number
}

type RankingData = {
  days: number
  period: { start: string; end: string }
  sample_count: number
  min_sample: number
  published: boolean
  items: RankingItem[]
}

const money = (v?: number | null) =>
  v == null ? '-' : `฿${Math.round(v).toLocaleString('en-US')}`

export default function DealRankings() {
  const { t } = useTranslation()
  const [data, setData] = useState<RankingData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .get('/public/rankings', {
        params: { scope: 'project', metric: 'deal_count', days: 90, limit: 8 },
      })
      .then((res) => {
        if (alive) setData(res.data as RankingData)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (failed || !data) return null

  return (
    <section className="rent-section">
      <div className="rent-section__head">
        <h2 className="rent-section__title">{t('publicSite.rankingsTitle')}</h2>
        <span className="rent-text-sm rent-text-muted">
          {t('publicSite.rankingsCaveat', { n: data.sample_count })}
        </span>
      </div>
      <p className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
        {t('publicSite.rankingsPeriod', {
          days: data.days,
          start: data.period.start,
          end: data.period.end,
        })}
      </p>

      {!data.published ? (
        <div className="rent-empty" style={{ padding: '24px 0' }}>
          {t('publicSite.rankingsEmpty', { n: data.min_sample })}
        </div>
      ) : (
        <ol className="rank-list">
          {data.items.map((item) => (
            <li key={`${item.name}-${item.rank}`} className="rank-list__item">
              <span className={`rank-list__no rank-list__no--${Math.min(item.rank, 4)}`}>
                {item.rank}
              </span>
              <div className="rank-list__main">
                <div className="rank-list__name">{item.name}</div>
                <div className="rank-list__sub">
                  {item.district || '-'}
                  {' · '}
                  {t('publicSite.rankingsDeals', { n: item.deal_count })}
                </div>
              </div>
              <div className="rank-list__value">
                <div>{money(item.avg_price)}</div>
                <div className="rank-list__sub">{t('publicSite.rankingsAvgPrice')}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
        {t('publicSite.rankingsNote')}
      </p>
    </section>
  )
}
