/**
 * 小区（楼盘）列表（匿名可看）。
 *
 * 楼盘字典的对外展示面。卡片带「在售 N 套 / 在租 N 套 + 价格区间」聚合——
 * 这是用户判断一个小区"有没有货"的最快方式，也是老站的做法。
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { publicApi, unwrapPage, type PublicProject } from '@/services/publicApi'
import { convertFromThb, loadRates, tenureLabel } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const PAGE_SIZE = 30

/** 价格区间文案：min/max 都为空返回空串（不显示这一行）。 */
const priceRange = (min?: number | null, max?: number | null): string => {
  if (!min && !max) return ''
  if (min && max) {
    if (min === max) return fmtMoney(min, 'THB')
    return `${fmtMoney(min, 'THB')} - ${fmtMoney(max, 'THB')}`
  }
  return fmtMoney(min ?? max ?? 0, 'THB')
}

export default function PublicCommunitiesPage() {
  const { t } = useI18n()
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<PublicProject[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await publicApi.projects({
          page: targetPage,
          page_size: PAGE_SIZE,
          q: debounced || undefined
        })
        const pageData = unwrapPage<PublicProject>(res)
        setTotal(pageData.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]))
      } catch (err) {
        console.error('[public projects] 加载失败', err)
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debounced]
  )

  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  // 下拉刷新（对齐 App 的 RefreshControl）
  usePullDownRefresh(async () => {
    await fetchPage(1)
    Taro.stopPullDownRefresh()
  })

  // 滚动到底自动加载下一页（对齐 App 的 FlatList onEndReached）
  useReachBottom(() => {
    if (loading || loadingMore || items.length >= total) return
    fetchPage(page + 1)
  })

  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-head'>
          <Text className='pub-head__title'>{t('pub.communitiesTitle')}</Text>
          <Text className='pub-head__hint'>
            {t('pub.communitiesHint')}
          </Text>
          <Input
            className='pub-search'
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            placeholder={t('pub.communitySearchPlaceholder')}
            confirmType='search'
          />
        </View>

        <Text className='pub-count'>{t('pub.totalCount', { n: total })}</Text>

        {loading ? (
          <View className='pub-loading'>{t('pub.loading')}</View>
        ) : items.length === 0 ? (
          <View className='pub-empty'>{t('pub.communitiesEmpty')}</View>
        ) : (
          <>
            {items.map((project) => {
              const saleRange = priceRange(project.sale_price_min, project.sale_price_max)
              const rentRange = priceRange(project.rent_price_min, project.rent_price_max)
              return (
                <View
                  key={project.id}
                  className='pub-project'
                  onClick={() =>
                    Taro.navigateTo({
                      url: `/pages/public/community-detail/index?id=${project.id}`
                    })
                  }
                >
                  {project.cover ? (
                    <Image className='pub-project__cover' src={project.cover} mode='aspectFill' />
                  ) : (
                    <View className='pub-project__nophoto'>
                      <Text>{t('pub.noPhoto')}</Text>
                    </View>
                  )}

                  <View className='pub-project__body'>
                    <Text className='pub-project__name'>{project.name}</Text>
                    {project.district || project.city ? (
                      <Text className='pub-project__sub'>
                        {[project.district, project.city].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}

                    <View className='pub-badges'>
                      <View className='badge badge--primary'>
                        <Text>{t('pub.saleCount', { n: project.sale_count ?? 0 })}</Text>
                      </View>
                      <View className='badge badge--neutral'>
                        <Text>{t('pub.rentCount', { n: project.rent_count ?? 0 })}</Text>
                      </View>
                      {project.tenure ? (
                        <View className='badge badge--neutral'>
                          <Text>{tenureLabel(project.tenure)}</Text>
                        </View>
                      ) : null}
                    </View>

                    {saleRange ? (
                      <Text className='pub-project__price'>
                        {t('pub.salePrice')}：{saleRange}
                        {project.sale_price_min ? (
                          <Text className='pub-listing__price-sub'>
                            {'  '}≈ {fmtMoney(convertFromThb(project.sale_price_min), 'CNY')}{t('pub.upto')}
                          </Text>
                        ) : null}
                      </Text>
                    ) : null}
                    {rentRange ? (
                      <Text className='pub-project__price'>
                        {t('pub.rentPrice')}：{rentRange}
                        <Text className='pub-listing__price-sub'>{t('pub.perMonth')}</Text>
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })}

            {loadingMore ? (
              <View className='pub-loading'>{t('pub.loading')}</View>
            ) : null}
          </>
        )}
      </View>

      <BottomNav role='guest' active='communities' />
    </View>
  )
}
