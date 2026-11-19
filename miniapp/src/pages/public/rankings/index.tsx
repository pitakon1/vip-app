/**
 * 平台成交榜单 / 成交行情（C 端公开）。
 *
 * 数据只来自 `/public/rankings`，仅聚合平台 `property_deals` 已完成样本；
 * 界面固定展示「平台样本 n=xx，非全市场」，样本不足时只显示提示、不编造排名。
 * 对齐 App `screens/public/PublicRankingsScreen.tsx`。
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro'
import { publicApi } from '@/services/publicApi'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import './index.scss'

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
  period?: { start?: string | null; end?: string | null }
  sample_count: number
  min_sample: number
  published: boolean
  items: RankingItem[]
}

const METRIC_LABEL_KEY: Record<Metric, string> = {
  deal_count: 'pub.rankingsByCount',
  avg_price: 'pub.rankingsByPrice',
  avg_psqm: 'pub.rankingsByPsqm'
}

export default function PublicRankingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [scope, setScope] = useState<Scope>((router.params?.scope as Scope) || 'project')
  const [metric, setMetric] = useState<Metric>((router.params?.metric as Metric) || 'deal_count')
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res: any = await publicApi.rankings({ scope, metric, days: 90, limit: 20 })
      setData((res?.data ?? res) as RankingData)
    } catch (err) {
      console.error('[public rankings] 加载失败', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [scope, metric])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // 下拉刷新，与小区列表一致
  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const metricValue = (item: RankingItem) => {
    if (metric === 'deal_count') return t('pub.rankingsDeals', { n: item.deal_count })
    const v = metric === 'avg_price' ? item.avg_price : item.avg_psqm
    return v == null ? '-' : fmtMoney(v, 'THB')
  }

  return (
    <View className='pub-page pub-page--no-nav'>
      <ShellHeader title={t('pub.rankingsTitle')} showHome={false} />
      <View className='pub-inner'>
        {/* 口径切换：楼盘 / 区域 */}
        <View className='pub-segment'>
          {(['project', 'district'] as Scope[]).map((s) => (
            <View
              key={s}
              className={`pub-segment__item${scope === s ? ' pub-segment__item--on' : ''}`}
              onClick={() => setScope(s)}
            >
              <Text>
                {t(s === 'project' ? 'pub.rankingsTabProject' : 'pub.rankingsTabDistrict')}
              </Text>
            </View>
          ))}
        </View>

        {/* 指标切换 */}
        <View className='pub-chips pub-chips--wrap rank-chips'>
          {(['deal_count', 'avg_price', 'avg_psqm'] as Metric[]).map((m) => (
            <View
              key={m}
              className={`pub-chip${metric === m ? ' pub-chip--on' : ''}`}
              onClick={() => setMetric(m)}
            >
              <Text>{t(METRIC_LABEL_KEY[m])}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <StateBlock loading text={t('pub.loading')} />
        ) : loadError ? (
          <StateBlock
            error
            text={t('pub.rankingsLoadError')}
            retryText={t('common.retry')}
            onRetry={load}
          />
        ) : data ? (
          <View className='pub-card rank-card'>
            <View className='rank-card__head'>
              <Text className='pub-card__title'>{t('pub.rankingsTitle')}</Text>
              <Text className='rank-card__caveat'>
                {t('pub.rankingsCaveat', { n: data.sample_count })}
              </Text>
            </View>
            <Text className='rank-card__period'>
              {t('pub.rankingsPeriod', {
                days: data.days,
                start: data.period?.start ?? '-',
                end: data.period?.end ?? '-'
              })}
            </Text>

            {!data.published ? (
              <Text className='rank-card__empty'>
                {t('pub.rankingsEmpty', { n: data.min_sample })}
              </Text>
            ) : (
              <View className='rank-list'>
                {data.items.map((item) => (
                  <View key={`${item.rank}-${item.name}`} className='rank-row'>
                    <Text className={`rank-row__no${item.rank <= 3 ? ' rank-row__no--top' : ''}`}>
                      {item.rank}
                    </Text>
                    <View className='rank-row__main'>
                      <Text className='rank-row__name'>{item.name}</Text>
                      <Text className='rank-row__sub'>
                        {item.district || '-'}
                        {' · '}
                        {t('pub.rankingsDeals', { n: item.deal_count })}
                      </Text>
                    </View>
                    <View className='rank-row__value'>
                      <Text className='rank-row__amount'>{metricValue(item)}</Text>
                      <Text className='rank-row__sub'>{t(METRIC_LABEL_KEY[metric])}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text className='rank-card__note'>{t('pub.rankingsNote')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
