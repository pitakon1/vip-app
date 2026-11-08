import { useTranslation } from 'react-i18next'
import LazyImage from '@/components/LazyImage'
import { formatMoney } from '@/lib/money'
import { optionalNumber } from '@/lib/displayValue'
import { STATUS_CLASS, TYPE_ICON_PATH, formatTotal } from './constants'

/**
 * 房源卡片（对齐原型 rent-prop-search-card）。
 * 纯展示：数据口径与合计逻辑都来自 /public/listings 的响应。
 */
export default function PropertyCard({
  item,
  biz,
  schoolId,
  onClick,
  propertyTypeMap,
  statusLabelMap,
  favorited,
  onToggleFavorite,
}: {
  item: any
  biz: string
  schoolId: string
  onClick: (item: any) => void
  propertyTypeMap: Record<string, string>
  statusLabelMap: Record<string, string>
  favorited?: boolean
  onToggleFavorite?: (item: any) => void
}) {
  const { t } = useTranslation()

  // 公开接口的字段口径：项目名在 project_name，价格为统一后的 price
  // （租=月租、售=挂牌总价），不再需要前端按业务类型拼字段。
  const projectName = item.project_name || item.building || ''
  const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
  const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
  const ptypeKey = (propertyTypeMap[item.property_type] ? item.property_type : 'apartment') as string
  const statusKey = (item.status || 'vacant').toLowerCase()
  const beds = optionalNumber(item.bedrooms)
  const baths = optionalNumber(item.bathrooms)
  const size = optionalNumber(item.size_sqm)
  const price = optionalNumber(item.price ?? item.monthly_rent)
  const cover = typeof item.cover === 'string' ? item.cover : ''

  // 卡面只保留价格一个强调色：其余 tag 一律中性
  const tags: string[] = []
  if (item.is_featured) tags.push(t('browse.featured'))
  if (item.owner_direct) tags.push(t('browse.ownerDirect'))
  if (item.vr_url) tags.push(t('browse.vr'))
  if (item.furnished) tags.push(t('browse.furnished'))
  tags.push(t('browse.moveIn'))

  return (
    <div className="rent-prop-search-card" onClick={() => onClick(item)}>
      <div
        className="rent-prop-search-card__banner"
        data-photo={cover ? 'true' : 'false'}
      >
        {/* 有实拍图就用图（贝壳式「图在前」），没有才回退暖灰占位 + 户型剪影 */}
        {cover ? <LazyImage className="rent-prop-search-card__cover" src={cover} alt={title} /> : null}
        <button
          className="rent-fav-btn"
          aria-label={t('property.followProperty')}
          data-active={!!favorited}
          style={{ color: favorited ? 'var(--rent-primary)' : undefined }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite?.(item) }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        {!cover && (
          <svg className="rent-prop-search-card__banner-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={TYPE_ICON_PATH(ptypeKey)} />
          </svg>
        )}
        <span className={`rent-prop-search-card__status-tag ${STATUS_CLASS[statusKey] || 'rent-status-tag--rented'}`}>
          {statusLabelMap[statusKey] || item.status}
        </span>
        {item.video_url && (
          <span className="rent-prop-search-card__video-tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19" /></svg>
            {t('browse.video')}
          </span>
        )}
        <span className="rent-pill rent-prop-search-card__type-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={TYPE_ICON_PATH(ptypeKey)} />
          </svg>
          {ptype}
        </span>
      </div>
      <div className="rent-prop-search-card__body">
        <h3 className="rent-prop-search-card__name">{title}</h3>
        <p className="rent-prop-search-card__address">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {item.address || '—'}
        </p>
        {/* 按学校找房时，卡片必须回显「离这所学校多远」——
            否则用户选了学校却看不出筛选生效在哪，等于白筛 */}
        {schoolId && item.nearest_school_name ? (
          <p className="rent-prop-search-card__school">
            {t('publicSite.distanceToSchool', {
              name: item.nearest_school_name,
              km: item.nearest_school_km ?? '-',
            })}
          </p>
        ) : null}
        <div className="rent-prop-search-card__tags">
          {tags.map((tag, i) => (
            <span key={i} className="rent-badge rent-badge--neutral">{tag}</span>
          ))}
        </div>
        {(size != null || beds != null || baths != null) && (
          <div className="rent-prop-search-card__stats">
            {size != null && (
              <span className="rent-prop-search-card__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                </svg>
                {size}㎡
              </span>
            )}
            {beds != null && (
              <span className="rent-prop-search-card__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
                </svg>
                {beds ? `${beds}${t('browse.statBed')}` : t('roomType.studio')}
              </span>
            )}
            {baths != null && (
              <span className="rent-prop-search-card__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12V6a2 2 0 0 1 2-2h1M9 6.5 6.5 4M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM7 19l-1 2M18 19l1 2" />
                </svg>
                {baths}{t('browse.statBath')}
              </span>
            )}
          </div>
        )}
        <div className="rent-prop-search-card__foot">
          <div className="rent-prop-search-card__price">
            <span className="rent-prop-search-card__price-value">
              {price != null
                ? (biz === 'sale' ? formatTotal(price, item.currency) : formatMoney(price, item.currency))
                : '—'}
            </span>
            {price != null && (
              <span className="rent-prop-search-card__price-unit">
                {biz === 'sale' ? t('browse.saleUnit') : t('property.perMonth')}
              </span>
            )}
          </div>
          <button className="rent-prop-search-card__cta" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(item) }}>
            {t('property.viewDetail')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
