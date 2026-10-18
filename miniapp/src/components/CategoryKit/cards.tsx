/**
 * 分类页卡片（各业务 × 物业类型字段不同）· 小程序。
 *
 * 只渲染真实存在的字段：后端公开卡片没有的字段（房源级近地铁、满二/满五年等中国税费口径）
 * 一律不展示，绝不用占位假数据补齐版面。颜色一律取 app.scss 的 CSS 变量。
 *
 * 与 App 端 `mobile-app/src/screens/category/categoryCards.tsx` 字段口径一致。
 */
import { View, Text, Image } from '@tarojs/components'
import { useI18n } from '@/i18n'
import { fmtMoney } from '@/utils/format'
import { coverOf, decorationLabel } from '@/lib/publicSite'
import type { PublicListing, PublicProject } from '@/services/publicApi'
import './cards.scss'

type TFn = (key: string, params?: Record<string, string | number>) => string

const num = (v?: number | null, digits = 0) =>
  v == null ? '' : Number(v).toFixed(digits).replace(/\.0+$/, '')

function Tag({ children }: { children: string }) {
  return (
    <View className='ck-tag'>
      <Text className='ck-tag__text'>{children}</Text>
    </View>
  )
}

function Cover({ uri, wide }: { uri: string; wide?: boolean }) {
  if (uri) {
    return <Image className={wide ? 'ck-cover ck-cover--wide' : 'ck-cover'} src={uri} mode='aspectFill' />
  }
  return (
    <View className={wide ? 'ck-cover ck-cover--ph ck-cover--wide' : 'ck-cover ck-cover--ph'}>
      <View className='icon-svg' style={{ width: '44rpx', height: '44rpx' }} />
    </View>
  )
}

/** 物业类型文案（复用全站 prop.type* 既有条目）。 */
function propertyTypeLabel(v: string | null | undefined, t: TFn): string {
  switch (v) {
    case 'apartment':
    case 'condo':
      return t('prop.typeApartment')
    case 'villa':
    case 'house':
      return t('prop.typeVilla')
    case 'shop':
    case 'commercial':
      return t('prop.typeCommercial')
    case 'office':
      return t('prop.typeOffice')
    case 'factory':
      return t('prop.typeFactory')
    default:
      return ''
  }
}

/** 通用「已核验 / 有视频 / VR / 优选 / 房东直租 / 带家具 / 装修」标签（真实字段派生）。 */
function commonTags(item: PublicListing, t: TFn): string[] {
  const tags: string[] = []
  if (item.verified_days_ago != null) tags.push(t('category.tagVerified'))
  if (item.video_url) tags.push(t('category.tagVideo'))
  if (item.vr_url) tags.push(t('category.tagVr'))
  if (item.is_featured) tags.push(t('category.tagFeatured'))
  if (item.owner_direct) tags.push(t('category.tagOwnerDirect'))
  if (item.furnished) tags.push(t('category.tagFurnished'))
  const deco = decorationLabel(item.decoration)
  if (deco) tags.push(deco)
  return tags
}

/** 住宅卡（租房 / 二手房）：封面 + 标题 + 标签 + 价格（二手房附单价/楼龄）。 */
export function ResidentialRow({
  item,
  mode,
  onPress
}: {
  item: PublicListing
  mode: 'rent' | 'sell'
  onPress: () => void
}) {
  const { t } = useI18n()
  const cover = coverOf(item)
  const title = item.project_name || item.room_number || item.address || t('category.unnamed')
  const price = item.price ?? (mode === 'rent' ? item.monthly_rent : item.asking_price)
  const unitPrice = mode === 'sell' && price && item.size_sqm ? price / item.size_sqm : null
  const age =
    mode === 'sell' && item.completion_year ? new Date().getFullYear() - item.completion_year : null
  const tags = commonTags(item, t).slice(0, 4)

  return (
    <View className='ck-row' hoverClass='ck-hover' onClick={onPress}>
      <Cover uri={cover} />
      <View className='ck-row__body'>
        <Text className='ck-row__title'>{title}</Text>
        {item.district || item.city ? (
          <Text className='ck-row__sub'>{[item.district, item.city].filter(Boolean).join(' · ')}</Text>
        ) : null}
        <View className='ck-row__facts'>
          {item.bedrooms != null ? (
            <Text className='ck-row__fact'>{`${item.bedrooms} ${t('category.bedShort')}`}</Text>
          ) : null}
          {item.size_sqm != null ? (
            <Text className='ck-row__fact'>{`${num(item.size_sqm, 1)}${t('pub.sqm')}`}</Text>
          ) : null}
          {age != null ? <Text className='ck-row__fact'>{t('category.ageYears', { n: age })}</Text> : null}
        </View>
        {tags.length > 0 ? (
          <View className='ck-tags'>
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View className='ck-row__price'>
          <Text className='ck-row__price-main'>{fmtMoney(price, item.currency || 'THB')}</Text>
          {mode === 'rent' ? <Text className='ck-row__price-unit'>{t('pub.perMonth')}</Text> : null}
          {unitPrice ? (
            <Text className='ck-row__price-unit'>
              {` · ${fmtMoney(Math.round(unitPrice), item.currency || 'THB')}/${t('pub.sqm')}`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** 商铺办公卡（横向）：面积 / 商圈·楼盘 / 标签 / 月租 + 日租金/㎡。 */
export function CommercialRow({ item, onPress }: { item: PublicListing; onPress: () => void }) {
  const { t } = useI18n()
  const cover = coverOf(item)
  const title = item.project_name || item.building || item.address || t('category.unnamed')
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·')
  const tags: string[] = []
  if (item.whole_floor_only) tags.push(t('category.tagWholeFloor'))
  if (item.whole_building_only) tags.push(t('category.tagWholeBuilding'))
  if (item.company_registrable) tags.push(t('category.tagRegistrable'))
  tags.push(...commonTags(item, t))
  const typeLabel = propertyTypeLabel(item.property_type, t)

  return (
    <View className='ck-row' hoverClass='ck-hover' onClick={onPress}>
      <View className='ck-row__cover-wrap'>
        <Cover uri={cover} />
        {typeLabel ? (
          <View className='ck-row__badge'>
            <Text className='ck-row__badge-text'>{typeLabel}</Text>
          </View>
        ) : null}
      </View>
      <View className='ck-row__body'>
        <Text className='ck-row__title'>{title}</Text>
        <Text className='ck-row__sub'>
          {[item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('pub.sqm')}` : null, place]
            .filter(Boolean)
            .join('/')}
        </Text>
        {tags.length > 0 ? (
          <View className='ck-tags'>
            {tags.slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View className='ck-row__price'>
          <Text className='ck-row__price-main'>
            {fmtMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}
          </Text>
          <Text className='ck-row__price-unit'>{t('pub.perMonth')}</Text>
        </View>
        {item.rent_per_sqm_day != null ? (
          <Text className='ck-row__price-sub'>
            {`${fmtMoney(item.rent_per_sqm_day, item.currency || 'THB')}/${t('pub.sqm')}/${t('category.perDay')}`}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** 厂房卡（横向）：土地面积 / 层高 / 荷载 / 柱距 / 电力 / 可环评 / 整栋。 */
export function FactoryRow({ item, onPress }: { item: PublicListing; onPress: () => void }) {
  const { t } = useI18n()
  const cover = coverOf(item)
  const title = item.project_name || item.building || item.address || t('category.unnamed')
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·')
  const specs: string[] = []
  if (item.land_area_sqm != null) specs.push(`${t('category.landArea')} ${num(item.land_area_sqm)}${t('pub.sqm')}`)
  if (item.ceiling_height_m != null) specs.push(`${t('category.ceiling')} ${num(item.ceiling_height_m, 1)}m`)
  if (item.floor_loading_kg_sqm != null)
    specs.push(`${t('category.floorLoading')} ${num(item.floor_loading_kg_sqm)}kg/㎡`)
  if (item.column_spacing) specs.push(`${t('category.columnSpacing')} ${item.column_spacing}`)
  if (item.power_capacity_kva != null) specs.push(`${t('category.power')} ${num(item.power_capacity_kva)}kVA`)
  if (item.environmental_permit) specs.push(t('category.tagEnvPermit'))
  if (item.whole_building_only) specs.push(t('category.tagWholeBuilding'))

  return (
    <View className='ck-row' hoverClass='ck-hover' onClick={onPress}>
      <Cover uri={cover} />
      <View className='ck-row__body'>
        <Text className='ck-row__title'>{title}</Text>
        <Text className='ck-row__sub'>
          {[item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('pub.sqm')}` : null, place]
            .filter(Boolean)
            .join('/')}
        </Text>
        {specs.length > 0 ? (
          <View className='ck-tags'>
            {specs.slice(0, 5).map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </View>
        ) : null}
        <View className='ck-row__price'>
          <Text className='ck-row__price-main'>
            {fmtMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}
          </Text>
          <Text className='ck-row__price-unit'>{t('pub.perMonth')}</Text>
        </View>
      </View>
    </View>
  )
}

/** 楼盘卡（新房，纵向大图）。 */
export function ProjectRow({ item, onPress }: { item: PublicProject; onPress: () => void }) {
  const { t } = useI18n()
  const onSale = (item.listing_count ?? 0) > 0
  const sizeRange =
    item.size_min != null && item.size_max != null
      ? `${t('category.buildRange')}${num(item.size_min)}-${num(item.size_max)}${t('pub.sqm')}`
      : null
  const bedroomText =
    item.bedroom_options && item.bedroom_options.length
      ? `${item.bedroom_options.join(',')}${t('category.bedroomUnit')}`
      : null
  const location = [item.district, item.address || item.city].filter(Boolean).join('-')
  const priceRange =
    item.sale_price_min != null || item.sale_price_max != null
      ? item.sale_price_min === item.sale_price_max
        ? fmtMoney(item.sale_price_min ?? 0, 'THB')
        : `${fmtMoney(item.sale_price_min, 'THB')}-${fmtMoney(item.sale_price_max, 'THB')}`
      : null
  const tags: string[] = []
  if (item.nearest_subway) tags.push(t('category.tagNearSubway'))
  if (item.completion_year != null && item.completion_year <= new Date().getFullYear()) {
    tags.push(t('category.tagReady'))
  }
  const tenure = (() => {
    switch (item.tenure) {
      case 'freehold':
        return t('pub.tenure.freehold')
      case 'leasehold':
        return t('pub.tenure.leasehold')
      case 'mixed':
        return t('pub.tenure.mixed')
      default:
        return ''
    }
  })()
  if (tenure) tags.push(tenure)

  return (
    <View className='ck-project' hoverClass='ck-hover' onClick={onPress}>
      <Cover uri={item.cover || ''} wide />
      <View className='ck-project__body'>
        <View className='ck-project__head'>
          <Text className='ck-row__title'>{item.name}</Text>
          {onSale ? (
            <View className='ck-project__badge'>
              <Text className='ck-project__badge-text'>{t('category.onSale')}</Text>
            </View>
          ) : null}
        </View>
        <Text className='ck-row__sub'>
          {[location, sizeRange, bedroomText].filter(Boolean).join(' / ')}
        </Text>
        {tags.length > 0 ? (
          <View className='ck-tags'>
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        {priceRange ? <Text className='ck-row__price-main'>{priceRange}</Text> : null}
        {(item.recent_deal_count ?? 0) > 0 ? (
          <Text className='ck-row__price-sub'>{t('category.recentDeals', { n: item.recent_deal_count ?? 0 })}</Text>
        ) : null}
      </View>
    </View>
  )
}

/** 房源横滑小卡（租房页「新上房源」rail）：封面在上，标题 / 位置 / 月租在下。 */
export function ListingRailCard({ item, onPress }: { item: PublicListing; onPress: () => void }) {
  const { t } = useI18n()
  const title = item.project_name || item.building || item.room_number || item.address || t('category.unnamed')
  const price = item.monthly_rent ?? item.price

  return (
    <View className='ck-railcard' hoverClass='ck-hover' onClick={onPress}>
      <Cover uri={coverOf(item)} wide />
      <View className='ck-railcard__body'>
        <Text className='ck-railcard__name'>{title}</Text>
        <Text className='ck-railcard__sub'>{[item.district, item.city].filter(Boolean).join(' · ')}</Text>
        {price != null ? (
          <Text className='ck-railcard__price'>{`${fmtMoney(price, item.currency || 'THB')}${t('pub.perMonth')}`}</Text>
        ) : null}
      </View>
    </View>
  )
}

/** 楼盘横滑小卡（新房页「热销」rail）。 */
export function ProjectRailCard({ item, onPress }: { item: PublicProject; onPress: () => void }) {
  const { t } = useI18n()
  return (
    <View className='ck-railcard' hoverClass='ck-hover' onClick={onPress}>
      <Cover uri={item.cover || ''} wide />
      <View className='ck-railcard__body'>
        <Text className='ck-railcard__name'>{item.name}</Text>
        <Text className='ck-railcard__sub'>{[item.district, item.city].filter(Boolean).join(' · ')}</Text>
        {item.sale_price_min != null ? (
          <Text className='ck-railcard__price'>
            {`${fmtMoney(item.sale_price_min, 'THB')}${t('category.priceFrom')}`}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
