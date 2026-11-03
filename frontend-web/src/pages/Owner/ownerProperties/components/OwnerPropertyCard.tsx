import { useTranslation } from 'react-i18next'
import { bannerColorFor, formatRent, propertyTypeMap, statusLabelMap } from '../constants'
import type { OwnerProperty } from '../types'

interface Props {
  item: OwnerProperty
  onView: (item: OwnerProperty) => void
  onPublish: (item: OwnerProperty) => void
  onEntrust: () => void
  onEdit: (item: OwnerProperty) => void
  onDelete: (id: string) => void
}

/** 房源卡片（banner + 主体 + 底部操作） */
const OwnerPropertyCard = ({ item, onView, onPublish, onEntrust, onEdit, onDelete }: Props) => {
  const { t } = useTranslation()

  const title = item.name || (item.project_name ? `${item.project_name} · ${item.room_number || ''}` : (item.room_number || item.address || '—'))
  const ptype = propertyTypeMap[item.property_type || ''] || item.property_type || 'ownerProperties.typeApartment'
  const statusKey = (item.status || 'vacant').toLowerCase()
  const beds = Number(item.bedrooms || 0)
  const baths = Number(item.bathrooms || 0)
  const size = Number(item.size_sqm || 0)
  const rent = Number(item.monthly_rent || 0)
  const seed = String(item.id || item.room_number || '')
  const curSymbol = item.currency === 'USD' ? '$' : item.currency === 'CNY' ? '¥' : '฿'

  const statusTone =
    statusKey === 'rented' ? 'success'
    : statusKey === 'vacant' ? 'warning'
    : statusKey === 'maintenance' ? 'info'
    : statusKey === 'renewing' ? 'warning'
    : 'neutral'

  return (
    <div
      className="rent-card rent-prop-card"
      onClick={() => onView(item)}
    >
      {/* 头部纯色 banner + 类型角标 */}
      <div className="rent-prop-card__banner" style={{ background: bannerColorFor(seed) }}>
        <span className="rent-prop-card__type-badge">{t(ptype)}</span>
      </div>

      {/* 主体 */}
      <div className="rent-prop-card__body">
        <h3 className="rent-prop-card__name">{title}</h3>
        <p className="rent-prop-card__address">{item.address || '—'}</p>
        <div className="rent-prop-card__stats">
          <span className="rent-prop-card__stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            {size}㎡
          </span>
          <span className="rent-prop-card__stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8V6a2 2 0 0 1 2-2h4"/></svg>
            {beds} {t('ownerProperties.unitBedroom')}
          </span>
          <span className="rent-prop-card__stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/><path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="7" y1="19" x2="7" y2="22"/><line x1="17" y1="19" x2="17" y2="22"/></svg>
            {baths} {t('ownerProperties.unitBath')}
          </span>
        </div>
        <div className="rent-prop-card__rent-row">
          <span className="rent-prop-card__rent">{curSymbol}{formatRent(rent)}<span className="rent-prop-card__rent-unit">{t('ownerProperties.perMonth')}</span></span>
          <span className={`rent-badge rent-badge--${statusTone}`}>
            {t(statusLabelMap[statusKey] || item.status)}
          </span>
        </div>
      </div>

      {/* 卡片底部操作：查看详情 / 委托挂牌 / 编辑 / 删除 */}
      <div className="rent-card__footer rent-prop-card__footer">
        <button
          type="button"
          className="rent-btn rent-btn--ghost rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); onView(item) }}
        >
          {t('ownerProperties.viewDetail')}
        </button>
        <button
          className="rent-btn rent-btn--primary rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); onPublish(item) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          {t('listing.actionList')}
        </button>
        <button
          className="rent-btn rent-btn--ghost rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); onEntrust() }}
        >
          {t('ownerProperties.entrustListing')}
        </button>
        <button
          className="rent-btn rent-btn--secondary rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); onEdit(item) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
          {t('common.edit')}
        </button>
        <button
          className="rent-btn rent-btn--danger rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}

export default OwnerPropertyCard
