/**
 * C 端房源详情（匿名可看）。
 *
 * 展示内容严格限定在公开口径：价格、房号地址、面积户型、朝向装修、房源描述、
 * 所属小区参数、周边学校距离、经纪人对外联络方式。
 *
 * **不要渲染分佣配置**（`sale_commission_rate` / `rental_commission_months` /
 * `mandate_type` / `split_option` / `buyer_side_rate` / `listing_side_rate`）。
 * 后端 `/public/listings/{id}` 的响应体里本来就没有这些字段——但如果哪天有人
 * 改成调站内 `/listings/{id}`，那些字段会带着 `None` 或真实值一起回来。
 * 详见上一轮修掉的分佣泄露缺陷。
 */
import { useEffect, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { publicApi, type PublicListingDetail } from '@/services/publicApi'
import {
  convertFromThb,
  decorationLabel,
  listingTypeLabel,
  loadRates,
  orientationLabel,
  photoUrls
} from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import PublicInquiryForm from '@/components/PublicInquiryForm'
import './index.scss'

export default function PublicListingDetailPage() {
  const router = useRouter()
  const id = router.params?.id ?? ''
  const [data, setData] = useState<PublicListingDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    publicApi
      .listing(id)
      .then((res) => {
        if (!cancelled) setData(res ?? null)
      })
      .catch((err) => {
        console.error('[public listing detail] 加载失败', err)
        if (!cancelled) setData(null)
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

  if (!data) {
    return (
      <View className='pub-page'>
        <View className='pub-empty'>房源不存在或已下架</View>
      </View>
    )
  }

  const photos = photoUrls(data.photos)
  const isSell = data.listing_type === 'sell'
  const price = data.price ?? (isSell ? data.asking_price : data.monthly_rent)

  const facts: Array<[string, string]> = [
    ['房间号', data.room_number ?? ''],
    ['楼栋', data.building ?? ''],
    ['楼层', data.floor != null ? String(data.floor) : ''],
    ['面积', data.size_sqm != null ? `${data.size_sqm} ㎡` : ''],
    [
      '户型',
      data.bedrooms != null || data.bathrooms != null
        ? `${data.bedrooms ?? '-'} BED · ${data.bathrooms ?? '-'} BATH`
        : ''
    ],
    ['朝向', orientationLabel(data.orientation)],
    ['装修', decorationLabel(data.decoration)],
    [
      '押金',
      data.deposit_amount
        ? fmtMoney(data.deposit_amount, data.currency || 'THB')
        : data.deposit_months
          ? `${data.deposit_months}个月`
          : ''
    ],
    ['房源编号', data.listing_no ?? '']
  ]

  const broker = data.broker
  const brokerLines: Array<[string, string]> = broker
    ? [
        ['机构', broker.company ?? ''],
        ['经纪人', broker.real_name ?? ''],
        ['电话', broker.phone ?? ''],
        ['微信', broker.wechat ?? ''],
        ['LINE', broker.line ?? ''],
        ['WhatsApp', broker.whatsapp ?? '']
      ]
    : []

  return (
    <View className='pub-page'>
      {/* 相册：横滑翻页 */}
      {photos.length > 0 ? (
        <ScrollView className='pub-gallery' scrollX pagingEnabled>
          {photos.map((url) => (
            <Image key={url} className='pub-gallery__img' src={url} mode='aspectFill' />
          ))}
        </ScrollView>
      ) : (
        <View className='pub-project__nophoto'>
          <Text>暂无图片</Text>
        </View>
      )}

      <View className='pub-inner'>
        <View className='pub-card'>
          <View style={{ display: 'flex', alignItems: 'center' }}>
            <Text className='pub-card__title'>{data.project_name || data.room_number || '房源'}</Text>
            {data.listing_type ? (
              <View
                className={`badge ${
                  isSell ? 'badge--neutral' : 'badge--primary'
                }`}
                style={{ marginLeft: '16rpx' }}
              >
                <Text>{listingTypeLabel(data.listing_type)}</Text>
              </View>
            ) : null}
          </View>
          {data.address ? <Text className='pub-card__sub'>{data.address}</Text> : null}

          <Text className='pub-listing__price'>
            {fmtMoney(price, data.currency || 'THB')}
            {isSell ? null : <Text className='pub-listing__price-sub'>/月</Text>}
          </Text>
          {price ? (
            <Text className='pub-project__sub'>
              ≈ {fmtMoney(convertFromThb(price), 'CNY')}
              {isSell ? '' : '/月'}
            </Text>
          ) : null}
        </View>

        {/* 关键参数 */}
        <View className='pub-card'>
          <Text className='pub-section__title'>房源信息</Text>
          <View className='pub-kv'>
            {facts
              .filter(([, value]) => !!value)
              .map(([label, value]) => (
                <View className='pub-kv__item' key={label}>
                  <Text className='pub-kv__k'>{label}</Text>
                  <Text className='pub-kv__v'>{value}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* 所属小区 */}
        {data.project ? (
          <View className='pub-card'>
            <Text className='pub-section__title'>所属小区</Text>
            <Text className='pub-project__name'>{data.project.name}</Text>
            <View className='pub-kv'>
              {data.project.developer_name ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>开发商</Text>
                  <Text className='pub-kv__v'>{data.project.developer_name}</Text>
                </View>
              ) : null}
              {data.project.total_units ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>总户数</Text>
                  <Text className='pub-kv__v'>{data.project.total_units}</Text>
                </View>
              ) : null}
              {data.project.completion_year ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>建成年份</Text>
                  <Text className='pub-kv__v'>{data.project.completion_year}</Text>
                </View>
              ) : null}
            </View>
            {data.project.id ? (
              <Text
                className='pub-link'
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/public/community-detail/index?id=${data.project?.id}`
                  })
                }
              >
                查看小区详情 ›
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* 周边学校 */}
        {(data.nearby_schools ?? []).length > 0 ? (
          <View className='pub-card'>
            <Text className='pub-section__title'>周边学校</Text>
            <Text className='pub-section__hint'>
              按直线距离排序，供有学龄子女的家庭参考。
            </Text>
            {(data.nearby_schools ?? []).map((school) => (
              <View
                className='pub-sheet__row'
                key={school.id ?? school.name ?? ''}
                onClick={() => {
                  if (school.id) {
                    Taro.navigateTo({ url: `/pages/public/school-detail/index?id=${school.id}` })
                  }
                }}
              >
                <View className='pub-row__main'>
                  <Text className='pub-row__title'>{school.name}</Text>
                  {school.name_en ? (
                    <Text className='pub-row__sub'>{school.name_en}</Text>
                  ) : null}
                </View>
                {school.distance_km != null ? (
                  <Text className='pub-row__distance'>{school.distance_km} 公里</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 描述 */}
        {data.description ? (
          <View className='pub-card'>
            <Text className='pub-section__title'>房源描述</Text>
            <Text className='pub-desc'>{data.description}</Text>
          </View>
        ) : null}

        {/* 经纪人 */}
        <View className='pub-card'>
          <Text className='pub-section__title'>服务经纪人</Text>
          {broker ? (
            <View className='pub-kv'>
              {brokerLines
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <View className='pub-kv__item' key={label}>
                    <Text className='pub-kv__k'>{label}</Text>
                    <Text className='pub-kv__v'>{value}</Text>
                  </View>
                ))}
            </View>
          ) : (
            <Text className='pub-section__hint'>暂无经纪人信息</Text>
          )}
        </View>

        {/* 留资 */}
        <PublicInquiryForm
          title='对这套房有兴趣？'
          note='留下联系方式，我们会尽快与你联系。浏览全部房源无需注册。'
          context={{ listing_id: data.id, property_id: data.property_id ?? undefined }}
          source='listing_detail'
          defaultMessage={`咨询房源：${data.project_name ?? ''} ${data.room_number ?? ''}`.trim()}
        />
      </View>
    </View>
  )
}
