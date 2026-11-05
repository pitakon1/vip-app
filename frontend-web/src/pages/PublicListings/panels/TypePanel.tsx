import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ListingFilters } from '../hooks/useListingFilters'

/**
 * 「类型」筛选面板：一个入口里放两组彼此独立、可叠加的条件。
 *
 * - 业务线：全部 / 租房 / 二手房 / 新房（listing_type + is_new_development，单选）
 * - 房产类型：全部 / 公寓 / 别墅 / 商铺办公 / 厂房 / 酒店 / 土地（property_type 组合，单选）
 *
 * 与区域 / 总价面板不同，这里用草稿态：只有点「应用」才把两组条件一起下推，
 * 「重置」只清空本面板，不影响其他筛选。
 */
export default function TypePanel({
  f,
  onClose,
}: {
  f: ListingFilters
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [biz, setBiz] = useState(f.biz)
  const [propertyType, setPropertyType] = useState(f.propertyTypeSel)

  return (
    <div className="rent-loc-panel rent-quick-panel rent-type-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-type-panel__group">
          <div className="rent-loc-panel__group-title">{t('browse.bizLine')}</div>
          <div className="rent-loc-panel__chips">
            {f.bizTabs.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`rent-loc-panel__chip ${biz === o.value ? 'rent-loc-panel__chip--active' : ''}`}
                onClick={() => setBiz(o.value as ListingFilters['biz'])}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-type-panel__group">
          <div className="rent-loc-panel__group-title">{t('browse.propertyType')}</div>
          <div className="rent-loc-panel__chips">
            {f.propertyTypeOptions.map((o) => (
              <button
                key={o.value || 'any'}
                type="button"
                className={`rent-loc-panel__chip ${propertyType === o.value ? 'rent-loc-panel__chip--active' : ''}`}
                onClick={() => setPropertyType(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => {
              setBiz('all')
              setPropertyType('')
            }}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => {
              f.setBiz(biz)
              f.setPropertyTypeSel(propertyType)
              onClose()
            }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
