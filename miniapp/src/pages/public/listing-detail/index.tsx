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
import { useI18n } from '@/i18n'
import PublicInquiryForm from '@/components/PublicInquiryForm'
import './index.scss'

export default function PublicListingDetailPage() {
  const { t } = useI18n()
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
        <View className='pub-loading'>{t('pub.loading')}</View>
      </View>
    )
  }

  if (!data) {
    return (
      <View className='pub-page'>
        <View className='pub-empty'>{t('pub.listingNotFound')}</View>
      </View>
    )
  }

  const photos = photoUrls(data.photos)
  const isSell = data.listing_type === 'sell'
  const price = data.price ?? (isSell ? data.asking_price : data.monthly_rent)

  const facts: Array<[string, string]> = [
    [t('pub.roomNumber'), data.room_number ?? ''],
    [t('pub.building'), data.building ?? ''],
    [t('pub.floor'), data.floor != null ? String(data.floor) : ''],
    [t('pub.size'), data.size_sqm != null ? `${data.size_sqm} ${t('pub.sqm')}` : ''],
    [
      t('pub.layout'),
      data.bedrooms != null || data.bathrooms != null
        ? `${data.bedrooms ?? '-'} BED · ${data.bathrooms ?? '-'} BATH`
        : ''
    ],
    [t('pub.orientationLabel'), orientationLabel(data.orientation)],
    [t('pub.decorationLabel'), decorationLabel(data.decoration)],
    [
      t('pub.deposit'),
      data.deposit_amount
        ? fmtMoney(data.deposit_amount, data.currency || 'THB')
        : data.deposit_months
          ? `${data.deposit_months}${t('pub.months')}`
          : ''
    ],
    [t('pub.listingNo'), data.listing_no ?? '']
  ]

  const broker = data.broker
  const brokerLines: Array<[string, string]> = broker
    ? [
        [t('pub.brokerOrg'), broker.company ?? ''],
        [t('pub.brokerName'), broker.real_name ?? ''],
        [t('pub.phone'), broker.phone ?? ''],
        [t('pub.wechat'), broker.wechat ?? ''],
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
          <Text>{t('pub.noPhoto')}</Text>
        </View>
      )}

      <View className='pub-inner'>
        <View className='pub-card'>
          <View style={{ display: 'flex', alignItems: 'center' }}>
            <Text className='pub-card__title'>{data.project_name || data.room_number || t('pub.listingItem')}</Text>
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
            {isSell ? null : <Text className='pub-listing__price-sub'>{t('pub.perMonth')}</Text>}
          </Text>
          {price ? (
            <Text className='pub-project__sub'>
              ≈ {fmtMoney(convertFromThb(price), 'CNY')}
              {isSell ? '' : t('pub.perMonth')}
            </Text>
          ) : null}
        </View>

        {/* 关键参数 */}
        <View className='pub-card'>
          <Text className='pub-section__title'>{t('pub.keyFacts')}</Text>
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
            <Text className='pub-section__title'>{t('pub.communityInfo')}</Text>
            <Text className='pub-project__name'>{data.project.name}</Text>
            <View className='pub-kv'>
              {data.project.developer_name ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>{t('pub.developer')}</Text>
                  <Text className='pub-kv__v'>{data.project.developer_name}</Text>
                </View>
              ) : null}
              {data.project.total_units ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>{t('pub.totalUnits')}</Text>
                  <Text className='pub-kv__v'>{data.project.total_units}</Text>
                </View>
              ) : null}
              {data.project.completion_year ? (
                <View className='pub-kv__item'>
                  <Text className='pub-kv__k'>{t('pub.completionYear')}</Text>
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
                {t('pub.viewCommunity')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* 周边学校 */}
        {(data.nearby_schools ?? []).length > 0 ? (
          <View className='pub-card'>
            <Text className='pub-section__title'>{t('pub.nearbySchools')}</Text>
            <Text className='pub-section__hint'>
              {t('pub.nearbySchoolsHint')}
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
                  <Text className='pub-row__distance'>{t('pub.kmValue', { km: school.distance_km })}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 描述 */}
        {data.description ? (
          <View className='pub-card'>
            <Text className='pub-section__title'>{t('pub.description')}</Text>
            <Text className='pub-desc'>{data.description}</Text>
          </View>
        ) : null}

        {/* 经纪人 */}
        <View className='pub-card'>
          <Text className='pub-section__title'>{t('pub.broker')}</Text>
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
            <Text className='pub-section__hint'>{t('pub.brokerEmpty')}</Text>
          )}
        </View>

        {/* 留资 */}
        <PublicInquiryForm
          title={t('pub.inquireTitle')}
          note={t('pub.inquireNote')}
          context={{ listing_id: data.id, property_id: data.property_id ?? undefined }}
          source='listing_detail'
          defaultMessage={t('pub.listingInquiryMessage', {
            project: data.project_name ?? '',
            room: data.room_number ?? ''
          })}
        />
      </View>
    </View>
  )
}
