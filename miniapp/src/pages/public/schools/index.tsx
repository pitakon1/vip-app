/**
 * 学校列表（学区找房一级入口，匿名可看）。
 *
 * 泰国买房/租房的第一决策因子是国际学校，这一页是最值钱的自然入口：
 * 用户按「办学阶段 / 课程体系」找学校，再进学校页反查周边房源。
 * 不做「学区房」标签——泰国没有划片入学。
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi'
import {
  CURRICULUM_OPTIONS,
  STAGE_OPTIONS,
  schoolStageLabel,
  curriculumLabel
} from '@/lib/publicSite'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const PAGE_SIZE = 30

export default function PublicSchoolsPage() {
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [stage, setStage] = useState('')
  const [curriculum, setCurriculum] = useState('')
  const [items, setItems] = useState<PublicSchool[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await publicApi.schools({
          page: targetPage,
          page_size: PAGE_SIZE,
          q: debounced || undefined,
          stage: stage || undefined,
          curriculum: curriculum || undefined
        })
        const pageData = unwrapPage<PublicSchool>(res)
        setTotal(pageData.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]))
      } catch (err) {
        console.error('[public schools] 加载失败', err)
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debounced, stage, curriculum]
  )

  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-head'>
          <Text className='pub-head__title'>国际学校</Text>
          <Text className='pub-head__hint'>
            按办学阶段与课程体系筛选，点进任一所即可看到周边在租房源与在售房源。
          </Text>
          <Input
            className='pub-search'
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            placeholder='学校名称 / 英文名'
            confirmType='search'
          />
        </View>

        <Text className='pub-chips__label'>办学阶段</Text>
        <ScrollView className='pub-chips' scrollX>
          {STAGE_OPTIONS.map(([value, label]) => (
            <View
              key={value || 'all'}
              className={`pub-chip${stage === value ? ' pub-chip--on' : ''}`}
              onClick={() => setStage(value)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </ScrollView>

        <Text className='pub-chips__label'>课程体系</Text>
        <ScrollView className='pub-chips' scrollX>
          {CURRICULUM_OPTIONS.map(([value, label]) => (
            <View
              key={value || 'all'}
              className={`pub-chip${curriculum === value ? ' pub-chip--on' : ''}`}
              onClick={() => setCurriculum(value)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </ScrollView>

        <Text className='pub-count'>共 {total} 所学校</Text>

        {loading ? (
          <View className='pub-loading'>加载中...</View>
        ) : items.length === 0 ? (
          <View className='pub-empty'>没有匹配的学校，换个条件试试</View>
        ) : (
          <>
            {items.map((school) => (
              <View
                key={school.id}
                className='pub-row'
                onClick={() =>
                  Taro.navigateTo({ url: `/pages/public/school-detail/index?id=${school.id}` })
                }
              >
                <View className='pub-row__main'>
                  <Text className='pub-row__title'>{school.name}</Text>
                  {school.name_en || school.district || school.city ? (
                    <Text className='pub-row__sub'>
                      {[school.name_en, school.district, school.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                  <View className='pub-badges'>
                    {school.stage ? (
                      <View className='badge badge--primary'>
                        <Text>{schoolStageLabel(school.stage)}</Text>
                      </View>
                    ) : null}
                    {school.curriculum ? (
                      <View className='badge badge--neutral'>
                        <Text>{curriculumLabel(school.curriculum)}</Text>
                      </View>
                    ) : null}
                    {school.age_range ? (
                      <View className='badge badge--neutral'>
                        <Text>{school.age_range}</Text>
                      </View>
                    ) : null}
                    {school.tuition_range ? (
                      <View className='badge badge--neutral'>
                        <Text>{school.tuition_range}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text className='pub-row__action'>查看周边房源 ›</Text>
              </View>
            ))}

            {loadingMore ? (
              <View className='pub-loading'>加载中...</View>
            ) : items.length < total ? (
              <View
                className='btn btn--secondary'
                onClick={() => {
                  if (loading || loadingMore) return
                  fetchPage(page + 1)
                }}
              >
                <Text>加载更多</Text>
              </View>
            ) : (
              <View className='pub-footer-note'>没有更多了</View>
            )}
          </>
        )}
      </View>

      <BottomNav role='guest' active='schools' />
    </View>
  )
}
