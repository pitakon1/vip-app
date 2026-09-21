/**
 * 学校详情 + 该校周边在租在售房源（学区找房的真正入口）。
 *
 * 用户从「想让孩子上这所学校」出发反查房子，而不是从「筛一套房」出发——
 * 这是老站学校页的做法，也是它自然搜索流量最值钱的一块。因此这一页的
 * 主体不是学校简介，而是**周边房源列表**（后端按 haversine 距离由近到远返回）。
 */
import { useEffect, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { publicApi, type PublicSchoolDetail } from '@/services/publicApi'
import {
  curriculumLabel,
  loadRates,
  photoUrls,
  schoolStageLabel
} from '@/lib/publicSite'
import PublicListingItem from '@/components/PublicListingItem'
import PublicInquiryForm from '@/components/PublicInquiryForm'
import './index.scss'

export default function PublicSchoolDetailPage() {
  const router = useRouter()
  const id = router.params?.id ?? ''
  const [school, setSchool] = useState<PublicSchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    publicApi
      .school(id, { radius_km: 5, limit: 12 })
      .then((res) => {
        if (!cancelled) setSchool(res ?? null)
      })
      .catch((err) => {
        console.error('[public school detail] 加载失败', err)
        if (!cancelled) setSchool(null)
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
      <View className='pub-page'>
        <View className='pub-loading'>加载中...</View>
      </View>
    )
  }

  if (!school) {
    return (
      <View className='pub-page'>
        <View className='pub-empty'>学校不存在或已下架</View>
      </View>
    )
  }

  const photos = photoUrls(school.photos)
  const listings = school.nearby_listings ?? []

  return (
    <View className='pub-page'>
      {photos.length > 0 ? (
        <Image className='pub-cover' src={photos[0]} mode='aspectFill' />
      ) : null}

      <View className='pub-inner'>
        <View className='pub-card'>
          <Text className='pub-card__title'>{school.name}</Text>
          {school.name_en ? <Text className='pub-card__sub'>{school.name_en}</Text> : null}

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

          <View className='pub-kv'>
            {school.address ? (
              <View className='pub-kv__item'>
                <Text className='pub-kv__k'>地址</Text>
                <Text className='pub-kv__v'>{school.address}</Text>
              </View>
            ) : null}
            {school.district || school.city ? (
              <View className='pub-kv__item'>
                <Text className='pub-kv__k'>区域</Text>
                <Text className='pub-kv__v'>
                  {[school.district, school.city].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}
            {school.student_count ? (
              <View className='pub-kv__item'>
                <Text className='pub-kv__k'>在校人数</Text>
                <Text className='pub-kv__v'>{school.student_count}</Text>
              </View>
            ) : null}
            {school.phone ? (
              <View className='pub-kv__item'>
                <Text className='pub-kv__k'>电话</Text>
                <Text className='pub-kv__v'>{school.phone}</Text>
              </View>
            ) : null}
            {school.website ? (
              <View className='pub-kv__item'>
                <Text className='pub-kv__k'>官网</Text>
                <Text className='pub-kv__v'>{school.website}</Text>
              </View>
            ) : null}
          </View>

          {school.description ? (
            <Text className='pub-desc'>{school.description}</Text>
          ) : null}
        </View>

        {/* 周边房源：学区找房的落地点 */}
        <Text className='pub-section__title'>周边房源</Text>
        <Text className='pub-section__hint'>按直线距离由近到远排列。</Text>
        {listings.length === 0 ? (
          <View className='pub-empty'>该学校周边暂无可租房源</View>
        ) : (
          listings.map((item) => <PublicListingItem key={item.id} item={item} />)
        )}

        <PublicInquiryForm
          title='想读这所学校？先看住哪儿'
          note='留下联系方式，我们会尽快与你联系。浏览全部房源无需注册。'
          context={{ school_id: school.id }}
          source='school_detail'
          defaultMessage={`我想了解 ${school.name ?? ''} 附近的房源`}
        />
      </View>
    </View>
  )
}
