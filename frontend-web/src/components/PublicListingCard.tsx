/**
 * C 端公开房源卡片（列表 / 学校页 / 小区页共用）。
 *
 * 价格一律「泰铢主价 + 人民币副价」并列：目标客群是中国客户，只看泰铢没有
 * 价格体感，这是决策必需而非视觉装饰。
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { convertCurrency, formatMoney } from '@/lib/money'

export type PublicListingCardData = {
  id: string
  listing_type?: string
  room_number?: string
  address?: string
  district?: string
  city?: string
  project_name?: string
  price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  cover?: string
  nearest_school_name?: string
  nearest_school_km?: number
}

type Props = {
  item: PublicListingCardData
}

const PublicListingCard = ({ item }: Props) => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const isRent = item.listing_type === 'rent'
  const price = item.price ?? 0
  const title =
    item.project_name ||
    item.room_number ||
    item.address ||
    t('publicSite.untitledListing')

  return (
    <article
      className="pub-listing"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/listing/${item.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/listing/${item.id}`)
      }}
    >
      <div className="pub-listing__media">
        {item.cover ? (
          <img className="pub-listing__img" src={item.cover} alt={title} loading="lazy" />
        ) : (
          <div className="pub-listing__placeholder">{t('publicSite.noPhoto')}</div>
        )}
      </div>

      <div className="pub-listing__body">
        <h3 className="pub-listing__title">{title}</h3>

        <div className="pub-listing__meta">
          {[
            item.size_sqm ? `${item.size_sqm} ${t('publicSite.sqm')}` : null,
            item.bedrooms ? `${item.bedrooms}${t('browse.statBed')}` : null,
            item.bathrooms ? `${item.bathrooms}${t('browse.statBath')}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>

        <div>
          <span className="pub-listing__price">
            {formatMoney(price, item.currency || 'THB')}
          </span>
          {isRent ? (
            <span className="pub-listing__price-sub">{t('property.perMonth')}</span>
          ) : null}
        </div>

        <div className="pub-listing__price-sub" style={{ marginLeft: 0 }}>
          ≈ {formatMoney(convertCurrency(price, 'CNY'), 'CNY')}
        </div>

        {item.nearest_school_name ? (
          <div className="pub-listing__school">
            {t('publicSite.distanceToSchool', {
              name: item.nearest_school_name,
              km: item.nearest_school_km ?? '-',
            })}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default PublicListingCard
