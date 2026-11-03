import { useTranslation } from 'react-i18next'
import type { ListingFilters } from '../hooks/useListingFilters'

/**
 * 「价格」弹层（对齐贝壳：快捷区间 chips + 自定义最低/最高 + 重置/确定）。
 */
export default function PricePanel({ f }: { f: ListingFilters }) {
  const { t } = useTranslation()
  const { priceRange, customMin, customMax, priceOptions, applyPricePreset, setPriceRange, setCustomMin, setCustomMax, resetPrice, setPriceOpen } = f

  return (
    <div className="rent-loc-panel rent-price-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('priceRange.quick')}</div>
          <div className="rent-loc-panel__chips">
            <button
              type="button"
              className={`rent-loc-panel__chip ${!priceRange ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => applyPricePreset('all')}
            >
              {t('priceRange.all')}
            </button>
            {priceOptions.filter((o) => o.value).map((o) => (
              <button
                key={o.value}
                type="button"
                className={`rent-loc-panel__chip ${priceRange === o.value ? 'rent-loc-panel__chip--active' : ''}`}
                onClick={() => applyPricePreset(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('priceRange.custom')}</div>
          <div className="rent-price-custom">
            <span className="rent-price-custom__cur">฿</span>
            <input
              className="rent-price-custom__input"
              type="number"
              min={0}
              value={customMin}
              placeholder={t('priceRange.minPlaceholder')}
              onChange={(e) => { const v = e.target.value; if (v) setPriceRange(''); setCustomMin(v.replace(/[^\d]/g, '')) }}
            />
            <span className="rent-price-custom__divider">{t('priceRange.to')}</span>
            <span className="rent-price-custom__cur">฿</span>
            <input
              className="rent-price-custom__input"
              type="number"
              min={0}
              value={customMax}
              placeholder={t('priceRange.maxPlaceholder')}
              onChange={(e) => { const v = e.target.value; if (v) setPriceRange(''); setCustomMax(v.replace(/[^\d]/g, '')) }}
            />
            <span className="rent-price-custom__unit">{t('priceRange.perMonth')}</span>
          </div>
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={resetPrice}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setPriceOpen(false)}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
