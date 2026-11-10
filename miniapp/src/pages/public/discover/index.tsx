import { CAROUSEL_PAGE_SIZE } from '@/lib/pagination'
/**
 * 发现（C 端底部 Tab）：城市行情 + 热门小区 + 国际学校。
 *
 * 对齐 App `screens/tenant/DiscoverScreen.tsx`：
 * - 首页黄金导航已覆盖房源分类入口，这里只提供决策前的市场信息；
 * - 内容全部来自匿名公开接口（`/public/*`），未登录访客也能看；
 * - 小区卡片进小区详情，学校卡片带着学校跳「找房」做空间筛选（默认 3km）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import {
  publicApi,
  unwrapPage,
  type PublicCategorySummary,
  type PublicProject,
  type PublicSchool
} from '@/services/publicApi'
import { schoolStageLabel, curriculumLabel } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import { useLocationStore } from '@/stores/location'
import useAuthStore from '@/stores/auth'
import { useI18n } from '@/i18n'
import BottomNav, { type NavRole } from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import './index.scss'

export default function DiscoverPage() {
  const { t } = useI18n()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const cityLabel = useLocationStore((s) => s.selection.cityLabel)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const navRole: NavRole = !token ? 'guest' : user?.role === 'owner' ? 'owner' : 'tenant'

  const [summary, setSummary] = useState<PublicCategorySummary | null>(null)
  const [projects, setProjects] = useState<PublicProject[]>([])
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    const [s, p, sc] = await Promise.allSettled([
      publicApi.listingCategorySummary({ city: cityKey || undefined }),
      publicApi.projects({
        city: cityKey || undefined,
        page_size: CAROUSEL_PAGE_SIZE,
        sort: 'hot'
      }),
      publicApi.schools({ page_size: CAROUSEL_PAGE_SIZE })
    ])
    if (s.status === 'fulfilled') setSummary((s.value as any) ?? null)
    setProjects(p.status === 'fulfilled' ? unwrapPage<PublicProject>(p.value).items : [])
    setSchools(sc.status === 'fulfilled' ? unwrapPage<PublicSchool>(sc.value).items : [])
    if (s.status === 'rejected' && p.status === 'rejected' && sc.status === 'rejected') {
      setFailed(true)
    }
    setLoading(false)
  }, [cityKey])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const stats = useMemo(
    () => [
      { key: 'rent', label: t('discover.statRent'), value: summary?.rent_count ?? 0 },
      { key: 'sale', label: t('discover.statSale'), value: summary?.sell_count ?? 0 },
      { key: 'new', label: t('discover.statNew'), value: summary?.new_count ?? 0 },
      { key: 'shop', label: t('discover.statShop'), value: summary?.office_shop_count ?? 0 }
    ],
    [summary, t]
  )

  // 区域均价：取均价最高的 5 个区做横向对比（数据缺失时整块不渲染）
  const districts = useMemo(() => {
    const rows = (summary?.district_price_pairs ?? [])
      .filter((d) => Number(d.avg_price) > 0)
      .slice()
      .sort((a, b) => Number(b.avg_price) - Number(a.avg_price))
      .slice(0, 5)
    const max = rows.length ? Number(rows[0].avg_price) : 0
    return rows.map((d) => ({
      district: d.district ?? '',
      avg: Number(d.avg_price),
      pct: max ? Math.max(0.08, Number(d.avg_price) / max) : 0
    }))
  }, [summary])

  const openCity = () => Taro.navigateTo({ url: '/pages/location/index' })

  const openProject = (id?: string | null) => {
    if (!id) return
    Taro.navigateTo({ url: `/pages/public/community-detail/index?id=${encodeURIComponent(id)}` })
  }

  // 对齐 App DiscoverScreen：学校卡片进学校详情（首页的学校 rail 才是带着学校去「找房」）
  const openSchool = (s: PublicSchool) => {
    Taro.navigateTo({ url: `/pages/public/school-detail/index?id=${encodeURIComponent(s.id)}` })
  }

  const projectPrice = (p: PublicProject): string => {
    if (p.rent_price_min != null) return `${fmtMoney(p.rent_price_min, 'THB')}${t('discover.rentUnit')}`
    if (p.sale_price_min != null) return `${fmtMoney(p.sale_price_min, 'THB')}${t('discover.saleUnit')}`
    return t('discover.noPrice')
  }

  return (
    <View className='pub-page discover-page'>
      <StatusTop />

      <View className='discover-hero'>
        <View className='discover-hero__row'>
          <Text className='discover-hero__title'>{t('discover.title')}</Text>
          <View className='discover-hero__city' onClick={openCity}>
            <Text className='discover-hero__city-text' numberOfLines={1}>
              {cityLabel || t('home.currentCity')}
            </Text>
            <Text className='discover-hero__city-caret'>▾</Text>
          </View>
        </View>
        <Text className='discover-hero__sub'>{t('discover.subtitle')}</Text>
      </View>

      <View className='discover-inner'>
        {loading ? (
          <StateBlock loading text={t('pub.loading')} />
        ) : failed ? (
          <StateBlock
            error
            text={t('loadFailed')}
            onRetry={() => {
              setLoading(true)
              void load()
            }}
            retryText={t('common.retry')}
          />
        ) : (
          <>
            {/* 市场速览：在租 / 在售 / 新房 / 商铺办公 实时挂牌数 */}
            <Text className='discover-section__title'>{t('discover.market')}</Text>
            <View className='discover-stats'>
              {stats.map((s) => (
                <View key={s.key} className='discover-stat'>
                  <Text className='discover-stat__value'>{s.value}</Text>
                  <Text className='discover-stat__label'>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* 区域均价对比 */}
            {districts.length > 0 && (
              <>
                <View className='discover-section__head'>
                  <Text className='discover-section__title'>{t('discover.districtPrice')}</Text>
                  <Text className='discover-section__hint'>{t('discover.perSqm')}</Text>
                </View>
                <View className='discover-price-card'>
                  {districts.map((d) => (
                    <View key={d.district} className='discover-price-row'>
                      <Text className='discover-price-row__name'>{d.district}</Text>
                      <View className='discover-price-row__bar'>
                        <View
                          className='discover-price-row__fill'
                          style={{ width: `${Math.round(d.pct * 100)}%` }}
                        />
                      </View>
                      <Text className='discover-price-row__value'>{fmtMoney(d.avg, 'THB')}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* 热门小区 */}
            {projects.length > 0 && (
              <>
                <View className='discover-section__head'>
                  <Text className='discover-section__title'>{t('pub.tabCommunities')}</Text>
                  <Text
                    className='discover-section__link'
                    onClick={() => Taro.navigateTo({ url: '/pages/public/communities/index' })}
                  >
                    {t('discover.viewAll')}
                  </Text>
                </View>
                <ScrollView className='discover-rail' scrollX>
                  {projects.map((p) => (
                    <View
                      key={p.id}
                      className='discover-card'
                      onClick={() => openProject(p.id)}
                    >
                      <View className='discover-card__media'>
                        {p.cover ? (
                          <Image className='discover-card__img' src={p.cover} mode='aspectFill' />
                        ) : (
                          <View className='discover-card__noimg'>{t('pub.noPhoto')}</View>
                        )}
                      </View>
                      <Text className='discover-card__title' numberOfLines={1}>
                        {p.name || '—'}
                      </Text>
                      <Text className='discover-card__sub' numberOfLines={1}>
                        {[p.district, p.city].filter(Boolean).join(' · ')}
                      </Text>
                      <Text className='discover-card__price'>{projectPrice(p)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* 国际学校 */}
            {schools.length > 0 && (
              <>
                <View className='discover-section__head'>
                  <Text className='discover-section__title'>{t('pub.tabSchools')}</Text>
                  <Text
                    className='discover-section__link'
                    onClick={() => Taro.navigateTo({ url: '/pages/public/schools/index' })}
                  >
                    {t('discover.viewAll')}
                  </Text>
                </View>
                <ScrollView className='discover-rail' scrollX>
                  {schools.map((s) => (
                    <View
                      key={s.id}
                      className='discover-card'
                      onClick={() => openSchool(s)}
                    >
                      <View className='discover-card__media'>
                        {s.cover_url ? (
                          <Image className='discover-card__img' src={s.cover_url} mode='aspectFill' />
                        ) : (
                          <View className='discover-card__noimg'>{t('pub.noPhoto')}</View>
                        )}
                      </View>
                      <Text className='discover-card__title' numberOfLines={1}>
                        {s.name || s.name_en || '—'}
                      </Text>
                      <Text className='discover-card__sub' numberOfLines={1}>
                        {[s.name_en, s.district].filter(Boolean).join(' · ')}
                      </Text>
                      <View className='discover-card__tags'>
                        <Text className='discover-tag'>{schoolStageLabel(s.stage)}</Text>
                        {s.curriculum ? (
                          <Text className='discover-tag'>{curriculumLabel(s.curriculum)}</Text>
                        ) : null}
                      </View>
                      <Text className='discover-card__price'>
                        {s.tuition_range || t('discover.noPrice')}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
      </View>

      <BottomNav role={navRole} active='discover' />
    </View>
  )
}
