import { useTranslation } from 'react-i18next'
import type { ListingFilters } from '../hooks/useListingFilters'

/**
 * 「更多」合并面板（对齐贝壳：面积 快捷区间+自定义 + 朝向/楼层/装修/配套 + 房源状态 + 重置/确定）。
 */
export default function MorePanel({ f }: { f: ListingFilters }) {
  const { t } = useTranslation()
  const {
    orientationSel, setOrientationSel, orientationOptions,
    floorLevelSel, setFloorLevelSel, floorLevelOptions,
    areaOptions, areaRange, setAreaRange, setAreaCustomMin, setAreaCustomMax,
    areaCustomMin, areaCustomMax, applyAreaPreset,
    decorSel, setDecorSel, decorationOptions,
    amenitySel, setAmenitySel, amenityOptions,
    vrSel, setVrSel, featuredSel, setFeaturedSel, ownerDirectSel, setOwnerDirectSel,
    statusSel, setStatusSel, statusOptions,
    resetMore, setMoreOpen,
  } = f

  return (
    <div className="rent-loc-panel rent-price-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{t('publicSite.orientationLabel')}</div>
        <div className="rent-loc-panel__chips">
          {orientationOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${orientationSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setOrientationSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('publicSite.floor')}</div>
        <div className="rent-loc-panel__chips">
          {floorLevelOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${floorLevelSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setFloorLevelSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('browse.filterArea')}</div>
        <div className="rent-loc-panel__chips">
          {areaOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${(o.value ? areaRange === o.value : !areaRange && !areaCustomMin && !areaCustomMax) ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => (o.value ? applyAreaPreset(o.value) : (setAreaRange(''), setAreaCustomMin(''), setAreaCustomMax('')))}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('priceRange.custom')}</div>
        <div className="rent-price-custom">
          <input
            className="rent-price-custom__input"
            type="number"
            min={0}
            value={areaCustomMin}
            placeholder={t('areaRange.minPlaceholder')}
            onChange={(e) => { const v = e.target.value; if (v) setAreaRange(''); setAreaCustomMin(v.replace(/[^\d]/g, '')) }}
          />
          <span className="rent-price-custom__divider">{t('priceRange.to')}</span>
          <input
            className="rent-price-custom__input"
            type="number"
            min={0}
            value={areaCustomMax}
            placeholder={t('areaRange.maxPlaceholder')}
            onChange={(e) => { const v = e.target.value; if (v) setAreaRange(''); setAreaCustomMax(v.replace(/[^\d]/g, '')) }}
          />
          <span className="rent-price-custom__unit">{t('areaRange.unit')}</span>
        </div>
        <div className="rent-loc-panel__group-title">{t('publicSite.decorationLabel')}</div>
        <div className="rent-loc-panel__chips">
          {decorationOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${decorSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setDecorSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('publicSite.facilities')}</div>
        <div className="rent-loc-panel__chips">
          {amenityOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${amenitySel.includes(o.value) ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() =>
                setAmenitySel((cur) =>
                  cur.includes(o.value) ? cur.filter((k) => k !== o.value) : [...cur, o.value],
                )
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('browse.filterMore')}</div>
        <div className="rent-loc-panel__chips">
          {([
            { key: 'vr', label: t('browse.vr'), val: vrSel, set: setVrSel },
            { key: 'featured', label: t('browse.featured'), val: featuredSel, set: setFeaturedSel },
            { key: 'ownerDirect', label: t('browse.ownerDirect'), val: ownerDirectSel, set: setOwnerDirectSel },
          ] as const).map((o) => (
            <button
              key={o.key}
              type="button"
              className={`rent-loc-panel__chip ${o.val === '1' ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => o.set(o.val === '1' ? '' : '1')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="rent-loc-panel__group-title">{t('browse.filterStatus')}</div>
        <div className="rent-loc-panel__chips">
          {statusOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${statusSel === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setStatusSel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={resetMore}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setMoreOpen(false)}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
