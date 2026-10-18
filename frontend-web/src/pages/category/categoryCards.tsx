/**
 * 分类页卡片（各业务 × 物业类型字段不同），对齐 App 端 `categoryCards.tsx` 的信息结构。
 *
 * 只渲染后端真实存在的字段：房源级「近地铁」、楼龄、单价等字段若后端未提供则一律
 * 不展示，绝不用占位假数据补齐版面。
 * 颜色一律取设计令牌（var(--rent-*)），禁止硬编码色值、禁止渐变。
 */
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { decorationLabel, photoUrls, tenureLabel } from '@/lib/publicLabels'
import { formatMoney } from '@/lib/money'

// ==================== 卡片数据契约（与后端 PublicListingCard / PublicProjectCard 对齐）====================

export interface PublicListing {
  id: string
  property_type?: string | null
  listing_type?: string | null
  room_number?: string | null
  address?: string | null
  district?: string | null
  city?: string | null
  project_name?: string | null
  building?: string | null
  cover?: string | null
  photos?: unknown
  video_url?: string | null
  vr_url?: string | null
  is_featured?: boolean | null
  owner_direct?: boolean | null
  monthly_rent?: number | null
  asking_price?: number | null
  price?: number | null
  currency?: string | null
  size_sqm?: number | null
  bedrooms?: number | null
  furnished?: boolean
  decoration?: string | null
  completion_year?: number | null
  verified_days_ago?: number | null
  rent_per_sqm_day?: number | null
  ceiling_height_m?: number | null
  land_area_sqm?: number | null
  floor_loading_kg_sqm?: number | null
  column_spacing?: string | null
  power_capacity_kva?: number | null
  environmental_permit?: boolean | null
  whole_floor_only?: boolean | null
  whole_building_only?: boolean | null
  company_registrable?: boolean | null
}

export interface PublicProject {
  id: string
  name?: string | null
  address?: string | null
  district?: string | null
  city?: string | null
  cover?: string | null
  tenure?: string | null
  completion_year?: number | null
  sale_status?: string | null
  nearest_subway?: string | null
  listing_count?: number
  recent_deal_count?: number
  size_min?: number | null
  size_max?: number | null
  bedroom_options?: number[] | null
  sale_price_min?: number | null
  sale_price_max?: number | null
}

// ==================== 工具 ====================

const num = (v?: number | null, digits = 0): string =>
  v == null ? '' : Number(v).toFixed(digits).replace(/\.0+$/, '')

const coverOf = (item: PublicListing): string | null => item.cover ?? photoUrls(item.photos)[0] ?? null

/** 物业类型文案（复用全站 `propertyType.*` 既有条目）。 */
function propertyTypeLabel(v: string | null | undefined, t: TFunction): string {
  switch (v) {
    case 'apartment':
    case 'condo':
      return t('propertyType.apartment')
    case 'villa':
    case 'house':
      return t('propertyType.villa')
    case 'shop':
    case 'commercial':
      return t('propertyType.shop')
    case 'office':
      return t('propertyType.office')
    case 'factory':
      return t('category.typeFactory')
    default:
      return ''
  }
}

function Cover({
  uri,
  className = 'cat-card__cover',
  placeholder,
}: {
  uri: string | null
  className?: string
  placeholder: ReactNode
}) {
  return uri ? (
    <img className={className} src={uri} alt="" loading="lazy" />
  ) : (
    <div className={`${className} cat-card__cover--ph`}>{placeholder}</div>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="cat-card__tag">{children}</span>
}

/** 通用「已核验 / 有视频 / 有VR / 优选 / 房东直租 / 带家具 / 装修」标签（真实字段派生）。 */
function commonTags(item: PublicListing, t: TFunction): string[] {
  const tags: string[] = []
  if (item.is_featured) tags.push(t('category.tagFeatured'))
  if (item.owner_direct) tags.push(t('category.tagOwnerDirect'))
  if (item.verified_days_ago != null) tags.push(t('category.tagVerified'))
  if (item.video_url) tags.push(t('category.tagVideo'))
  if (item.vr_url) tags.push(t('category.tagVr'))
  if (item.furnished) tags.push(t('category.tagFurnished'))
  const deco = decorationLabel(item.decoration, t)
  if (deco) tags.push(deco)
  return tags
}

// ==================== 住宅卡（租房 / 二手房）====================

export function ResidentialCard({
  item,
  mode,
  onPress,
}: {
  item: PublicListing
  mode: 'rent' | 'sell'
  onPress: () => void
}) {
  const { t } = useTranslation()
  const cover = coverOf(item)
  const title = item.project_name || item.room_number || item.address || t('category.unnamed')
  const price = item.price ?? (mode === 'rent' ? item.monthly_rent : item.asking_price)
  const unitPrice = mode === 'sell' && price && item.size_sqm ? price / item.size_sqm : null
  const age =
    mode === 'sell' && item.completion_year ? new Date().getFullYear() - item.completion_year : null
  const tags = commonTags(item, t).slice(0, 4)

  return (
    <button type="button" className="cat-card" onClick={onPress}>
      <Cover uri={cover} placeholder={<span className="cat-card__ph-icon">▣</span>} />
      <div className="cat-card__body">
        <h3 className="cat-card__title">{title}</h3>
        {item.district || item.city ? (
          <p className="cat-card__sub">{[item.district, item.city].filter(Boolean).join(' · ')}</p>
        ) : null}
        <div className="cat-card__facts">
          {item.bedrooms != null ? <span>{item.bedrooms} {t('category.bedShort')}</span> : null}
          {item.size_sqm != null ? <span>{num(item.size_sqm, 1)} {t('publicSite.sqm')}</span> : null}
          {age != null ? <span>{t('category.ageYears', { n: age })}</span> : null}
        </div>
        {tags.length > 0 ? (
          <div className="cat-card__tags">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <div className="cat-card__price-row">
          <span className="cat-card__price">{formatMoney(price, item.currency || 'THB')}</span>
          {mode === 'rent' ? <span className="cat-card__price-unit">{t('property.perMonth')}</span> : null}
          {unitPrice ? (
            <span className="cat-card__price-unit">
              · {formatMoney(Math.round(unitPrice), item.currency || 'THB')}/{t('publicSite.sqm')}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

// ==================== 商铺办公卡 ====================

export function CommercialCard({ item, onPress }: { item: PublicListing; onPress: () => void }) {
  const { t } = useTranslation()
  const cover = coverOf(item)
  const title = item.project_name || item.building || item.address || t('category.unnamed')
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·')
  const tags: string[] = []
  if (item.whole_floor_only) tags.push(t('category.tagWholeFloor'))
  if (item.whole_building_only) tags.push(t('category.tagWholeBuilding'))
  if (item.company_registrable) tags.push(t('category.tagRegistrable'))
  tags.push(...commonTags(item, t))
  const typeLabel = propertyTypeLabel(item.property_type, t)
  const sub = [
    item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('publicSite.sqm')}` : null,
    place,
  ]
    .filter(Boolean)
    .join('/')

  return (
    <button type="button" className="cat-card" onClick={onPress}>
      <div className="cat-card__cover-wrap">
        <Cover uri={cover} placeholder={<span className="cat-card__ph-icon">▣</span>} />
        {typeLabel ? <span className="cat-card__cover-badge">{typeLabel}</span> : null}
      </div>
      <div className="cat-card__body">
        <h3 className="cat-card__title">{title}</h3>
        {sub ? <p className="cat-card__sub">{sub}</p> : null}
        {tags.length > 0 ? (
          <div className="cat-card__tags">
            {tags.slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <div className="cat-card__price-row">
          <span className="cat-card__price">
            {formatMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}
          </span>
          <span className="cat-card__price-unit">{t('property.perMonth')}</span>
        </div>
        {item.rent_per_sqm_day != null ? (
          <span className="cat-card__price-sub">
            {formatMoney(item.rent_per_sqm_day, item.currency || 'THB')}/{t('publicSite.sqm')}/{t('category.perDay')}
          </span>
        ) : null}
      </div>
    </button>
  )
}

// ==================== 厂房卡 ====================

export function FactoryCard({ item, onPress }: { item: PublicListing; onPress: () => void }) {
  const { t } = useTranslation()
  const cover = coverOf(item)
  const title = item.project_name || item.building || item.address || t('category.unnamed')
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·')
  const specs: string[] = []
  if (item.land_area_sqm != null) specs.push(`${t('category.landArea')} ${num(item.land_area_sqm)}${t('publicSite.sqm')}`)
  if (item.ceiling_height_m != null) specs.push(`${t('category.ceiling')} ${num(item.ceiling_height_m, 1)}m`)
  if (item.floor_loading_kg_sqm != null)
    specs.push(`${t('category.floorLoading')} ${num(item.floor_loading_kg_sqm)}kg/㎡`)
  if (item.column_spacing) specs.push(`${t('category.columnSpacing')} ${item.column_spacing}`)
  if (item.power_capacity_kva != null) specs.push(`${t('category.power')} ${num(item.power_capacity_kva)}kVA`)
  if (item.environmental_permit) specs.push(t('category.tagEnvPermit'))
  if (item.whole_building_only) specs.push(t('category.tagWholeBuilding'))
  const sub = [
    item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('publicSite.sqm')}` : null,
    place,
  ]
    .filter(Boolean)
    .join('/')

  return (
    <button type="button" className="cat-card" onClick={onPress}>
      <Cover uri={cover} placeholder={<span className="cat-card__ph-icon">▣</span>} />
      <div className="cat-card__body">
        <h3 className="cat-card__title">{title}</h3>
        {sub ? <p className="cat-card__sub">{sub}</p> : null}
        {specs.length > 0 ? (
          <div className="cat-card__tags">
            {specs.slice(0, 5).map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
        ) : null}
        <div className="cat-card__price-row">
          <span className="cat-card__price">
            {formatMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}
          </span>
          <span className="cat-card__price-unit">{t('property.perMonth')}</span>
        </div>
      </div>
    </button>
  )
}

// ==================== 楼盘卡（新房）====================

export function ProjectCard({ item, onPress }: { item: PublicProject; onPress: () => void }) {
  const { t } = useTranslation()
  const onSale = (item.listing_count ?? 0) > 0
  const sizeRange =
    item.size_min != null && item.size_max != null
      ? `${t('category.buildRange')}${num(item.size_min)}-${num(item.size_max)}${t('publicSite.sqm')}`
      : null
  const bedroomText =
    item.bedroom_options && item.bedroom_options.length
      ? `${item.bedroom_options.join(',')}${t('category.bedroomUnit')}`
      : null
  const location = [item.district, item.address || item.city].filter(Boolean).join('-')
  const priceRange =
    item.sale_price_min != null || item.sale_price_max != null
      ? item.sale_price_min === item.sale_price_max
        ? formatMoney(item.sale_price_min ?? 0, 'THB')
        : `${formatMoney(item.sale_price_min, 'THB')}-${formatMoney(item.sale_price_max, 'THB')}`
      : null
  const tags: string[] = []
  if (item.nearest_subway) tags.push(t('category.tagNearSubway'))
  if (item.completion_year != null && item.completion_year <= new Date().getFullYear()) {
    tags.push(t('category.tagReady'))
  }
  const tenure = tenureLabel(item.tenure, t)
  if (tenure) tags.push(tenure)

  return (
    <button type="button" className="cat-project" onClick={onPress}>
      {item.cover ? (
        <img className="cat-project__cover" src={item.cover} alt="" loading="lazy" />
      ) : (
        <div className="cat-project__cover cat-card__cover--ph">
          <span className="cat-card__ph-icon">▤</span>
        </div>
      )}
      <div className="cat-project__body">
        <div className="cat-project__head">
          <h3 className="cat-card__title">{item.name}</h3>
          {onSale ? <span className="cat-project__badge">{t('category.onSale')}</span> : null}
        </div>
        <p className="cat-card__sub">
          {[location, sizeRange, bedroomText].filter(Boolean).join(' / ')}
        </p>
        {tags.length > 0 ? (
          <div className="cat-card__tags">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        {priceRange ? <div className="cat-card__price">{priceRange}</div> : null}
        {(item.recent_deal_count ?? 0) > 0 ? (
          <span className="cat-card__price-sub">
            {t('category.recentDeals', { n: item.recent_deal_count ?? 0 })}
          </span>
        ) : null}
      </div>
    </button>
  )
}

// ==================== 楼盘横滑小卡（新房页「热销」rail）====================

export function ProjectRailCard({ item, onPress }: { item: PublicProject; onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className="cat-rail-card" onClick={onPress}>
      {item.cover ? (
        <img className="cat-rail-card__cover" src={item.cover} alt="" loading="lazy" />
      ) : (
        <div className="cat-rail-card__cover cat-card__cover--ph">
          <span className="cat-card__ph-icon">▤</span>
        </div>
      )}
      <div className="cat-rail-card__body">
        <h3 className="cat-rail-card__name">{item.name}</h3>
        <p className="cat-rail-card__sub">{[item.district, item.city].filter(Boolean).join(' · ')}</p>
        {item.sale_price_min != null ? (
          <span className="cat-rail-card__price">
            {formatMoney(item.sale_price_min, 'THB')}
            {t('category.priceFrom')}
          </span>
        ) : null}
      </div>
    </button>
  )
}
