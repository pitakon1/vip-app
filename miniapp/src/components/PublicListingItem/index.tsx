/**
 * C 端房源卡片（找房列表 / 学校详情 / 小区详情共用）—— 对齐 App PublicListingRow。
 *
 * 只渲染 C 端该看的信息：封面、房号/地址、租金或挂牌价、面积户型、标签行，以及
 * 「距 XX 学校 约 N 公里」的学区回显。
 *
 * **不要在这里渲染任何分佣配置**（佣金比例、佣金月数、客源/房源分成、独家与否）。
 * 那是平台与业主/经纪人的议价条款，后端公开接口已裁剪，前端也不要再拼。
 *
 * 样式类 `.pub-listing*` 来自 `pages/public/public-site.scss`，
 * 由引用本组件的页面负责 import。
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { PublicListing } from '@/services/publicApi'
import { coverOf, listingTypeLabel } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'

interface Props {
  item: PublicListing
}

export default function PublicListingItem({ item }: Props) {
  const { t } = useI18n()
  const cover = coverOf(item)
  const isSell = item.listing_type === 'sell'
  const price = item.price ?? (isSell ? item.asking_price : item.monthly_rent)
  const title = item.project_name || item.room_number || item.address || t('pub.listingItem')
  // 房号 + 地址合并为一行，减少文本层级（与 App 一致）
  const subline = [
    item.project_name && item.room_number ? item.room_number : null,
    item.address
  ]
    .filter(Boolean)
    .join(' · ')
  const facts = [
    item.bedrooms != null ? `${item.bedrooms} BED` : null,
    item.bathrooms != null ? `${item.bathrooms} BATH` : null,
    item.size_sqm != null ? `${item.size_sqm} ${t('pub.sqm')}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  const tags = [
    item.owner_direct ? t('category.tagOwnerDirect') : null,
    item.is_featured ? t('category.tagFeatured') : null,
    item.vr_url ? t('category.tagVr') : null
  ].filter(Boolean) as string[]

  return (
    <View
      className='pub-listing'
      onClick={() => Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${item.id}` })}
    >
      <View className='pub-listing__media'>
        {cover ? (
          <Image className='pub-listing__img' src={cover} mode='aspectFill' />
        ) : (
          <View className='pub-listing__noimg'>
            <Text>{t('pub.noPhoto')}</Text>
          </View>
        )}
        {item.listing_type ? (
          <View className='pub-listing__type'>
            <Text>{listingTypeLabel(item.listing_type)}</Text>
          </View>
        ) : null}
      </View>

      <View className='pub-listing__body'>
        <Text className='pub-listing__title'>{title}</Text>
        {subline ? <Text className='pub-listing__addr'>{subline}</Text> : null}
        {facts ? <Text className='pub-listing__facts'>{facts}</Text> : null}

        {tags.length ? (
          <View className='pub-listing__tags'>
            {tags.map((tag) => (
              <Text key={tag} className='pub-listing__tag'>
                {tag}
              </Text>
            ))}
          </View>
        ) : null}

        <Text className='pub-listing__price'>
          {fmtMoney(price, item.currency || 'THB')}
          {isSell ? null : <Text className='pub-listing__price-sub'>{t('pub.perMonth')}</Text>}
        </Text>

        {item.nearest_school_km != null && item.nearest_school_name ? (
          <Text className='pub-listing__school'>
            {t('pub.distanceToSchool', {
              name: item.nearest_school_name,
              km: item.nearest_school_km
            })}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
