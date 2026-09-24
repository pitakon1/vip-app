/**
 * 首页横向房源栏（业主首页 / 租客首页共用，两处渲染逐字一致）。
 *
 * 样式类 `.rv-*` 来自两个首页各自的 `index.scss`，由引用本组件的页面负责 import。
 */
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { iconStyle } from '@/utils/icons'
import { fmtMoney as formatMoney } from '@/utils/format'
import { formatDay, propertyAddress, propertyTags, propertyTitle } from '@/lib/homeShared'

interface Props {
  title: string
  items: any[]
  favSet: Set<string>
  onToggleFavorite: (id: string) => void
}

export default function PropertyRail({ title, items, favSet, onToggleFavorite }: Props) {
  return (
    <View className='rv-sec'>
      <View className='rv-sec__head'>
        <Text className='rv-sec__title'>{title}</Text>
        <Text
          className='rv-sec__more'
          onClick={() => Taro.navigateTo({ url: '/pages/tenant/listings/index' })}
        >
          更多 ›
        </Text>
      </View>
      {items.length === 0 ? (
        <View className='empty-state'>
          <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
          <Text>暂无房源</Text>
        </View>
      ) : (
        <ScrollView scrollX className='rv-rail'>
          <View className='rv-rail-inner'>
            {items.map((item) => (
              <View
                key={item?.id}
                className='rv-prop'
                onClick={() =>
                  Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item?.id}` })
                }
              >
                <View className='rv-prop__img'>
                  <View className='rv-prop__img-icon icon-svg' style={iconStyle('home', 48)} />
                  {!!item?.property_type && (
                    <Text className='rv-prop__badge'>{item.property_type}</Text>
                  )}
                  <View
                    className='rv-prop__fav'
                    aria-label={favSet.has(String(item?.id)) ? '取消收藏' : '收藏'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(String(item?.id))
                    }}
                  >
                    <View
                      className='icon-svg'
                      style={iconStyle(
                        favSet.has(String(item?.id)) ? 'heartFill' : 'heart',
                        32
                      )}
                    />
                  </View>
                </View>
                <View className='rv-prop__body'>
                  <Text className='rv-prop__name'>{propertyTitle(item)}</Text>
                  <Text className='rv-prop__addr'>{propertyAddress(item) || '—'}</Text>
                  <View className='rv-prop__tags'>
                    {propertyTags(item).map((tag) => (
                      <Text key={tag} className='rv-tag'>{tag}</Text>
                    ))}
                  </View>
                  <View className='rv-prop__bottom'>
                    <Text className='rv-prop__price'>
                      {Number(item?.sale_price) > 0
                        ? formatMoney(item.sale_price, item?.currency)
                        : `${formatMoney(item?.monthly_rent, item?.currency)}/月`}
                    </Text>
                    <Text className='rv-prop__meta'>{formatDay(item?.created_at || item?.published_at)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
