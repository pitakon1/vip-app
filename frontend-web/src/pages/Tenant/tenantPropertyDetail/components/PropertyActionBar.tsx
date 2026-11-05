import { useTranslation } from 'react-i18next'
import { ICONS, Icon } from '../icons'

interface Props {
  favorited: boolean
  favBusy: boolean
  biz: 'rent' | 'buy'
  hasSaleListing: boolean
  onToggleFavorite: () => void
  onOpenLoan: () => void
  onOpenBooking: () => void
  onContactBroker: () => void
  contactBusy?: boolean
}

/** 底部固定操作栏：收藏 / 贷款试算 / 预约看房 */
const PropertyActionBar = ({
  favorited,
  favBusy,
  biz,
  hasSaleListing,
  onToggleFavorite,
  onOpenLoan,
  onOpenBooking,
  onContactBroker,
  contactBusy,
}: Props) => {
  const { t } = useTranslation()

  return (
    <div className="rent-detail-bar">
      <div className="rent-detail-bar__inner">
        <button
          className="rent-detail-bar__fav"
          type="button"
          aria-label={t('tenantPropertyDetail.ariaFavorite')}
          data-active={favorited}
          disabled={favBusy}
          onClick={onToggleFavorite}
        >
          <Icon d={ICONS.heart} />
          <span>{favorited ? t('tenantPropertyDetail.favorited') : t('tenantPropertyDetail.addFavorite')}</span>
        </button>
        <button
          className="rent-btn rent-detail-bar__contact"
          type="button"
          disabled={contactBusy}
          onClick={onContactBroker}
        >
          {t('tenantPropertyDetail.contactBroker')}
        </button>
        <button
          className="rent-btn rent-v17-bar__loan"
          type="button"
          hidden={biz !== 'buy' || !hasSaleListing}
          onClick={onOpenLoan}
        >
          {t('tenantPropertyDetail.calcLoan_placeholder')}
        </button>
        <button
          className="rent-btn rent-btn--primary rent-btn--lg rent-detail-bar__book"
          type="button"
          onClick={onOpenBooking}
        >
          {t('tenantPropertyDetail.bookNow')}
        </button>
      </div>
    </div>
  )
}

export default PropertyActionBar
