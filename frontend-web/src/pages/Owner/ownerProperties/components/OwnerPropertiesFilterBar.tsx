import { useTranslation } from 'react-i18next'
import { AREA_TIERS, PRICE_TIERS } from '@/constants/filters'
import type { OwnerPropertyFilters } from '../types'

export type SetOwnerPropertyFilter = <K extends keyof OwnerPropertyFilters>(
  key: K,
  value: OwnerPropertyFilters[K],
) => void

interface Props {
  filters: OwnerPropertyFilters
  setFilter: SetOwnerPropertyFilter
}

/** Filter Bar（对齐管理员端：搜索 + 状态 + 房型 + 价格 + 面积 + 排序） */
const OwnerPropertiesFilterBar = ({ filters, setFilter }: Props) => {
  const { t } = useTranslation()

  return (
    <div className="rent-filter-bar">
      <div className="rent-search rent-filter-bar__search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder={t('ownerProperties.phSearch')}
          value={filters.keyword}
          onChange={(e) => setFilter('keyword', e.target.value)}
        />
      </div>
      <select className="rent-form-select rent-filter-bar__select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
        <option value="">{t('ownerProperties.allStatus')}</option>
        <option value="rented">{t('ownerProperties.stRented')}</option>
        <option value="vacant">{t('ownerProperties.stVacant')}</option>
        <option value="renewing">{t('ownerProperties.stRenewing')}</option>
        <option value="maintenance">{t('ownerProperties.stMaintenance')}</option>
      </select>
      <select className="rent-form-select rent-filter-bar__select" value={filters.bedrooms} onChange={(e) => setFilter('bedrooms', e.target.value)}>
        <option value="">{t('ownerProperties.allLayout')}</option>
        <option value="0">{t('ownerProperties.layoutStudio')}</option>
        <option value="1">{t('ownerProperties.layoutRoom', { n: 1 })}</option>
        <option value="2">{t('ownerProperties.layoutRoom', { n: 2 })}</option>
        <option value="3">{t('ownerProperties.layoutRoom', { n: 3 })}</option>
        <option value="4">{t('ownerProperties.layout4Plus')}</option>
      </select>
      <select className="rent-form-select rent-filter-bar__select" value={filters.priceRange} onChange={(e) => setFilter('priceRange', e.target.value)}>
        <option value="">{t('ownerProperties.allPrice')}</option>
        {PRICE_TIERS.map((tier) => (
          <option key={tier.key} value={tier.key}>
            {tier.key === '0-5000'
              ? t('ownerProperties.priceBelow', { n: String(tier.max) })
              : tier.key === '50000+'
                ? t('ownerProperties.priceAbove', { n: String(tier.min) })
                : `${tier.min}-${tier.max}`}
          </option>
        ))}
        <option value="custom">{t('ownerProperties.customPrice')}</option>
      </select>
      {filters.priceRange === 'custom' && (
        <div className="rent-filter-bar__custom">
          <input
            className="rent-filter-bar__custom-input"
            type="number"
            min={0}
            value={filters.priceCustomMin}
            placeholder={t('ownerProperties.phMin')}
            onChange={(e) => setFilter('priceCustomMin', e.target.value)}
          />
          <span className="rent-filter-bar__custom-sep">-</span>
          <input
            className="rent-filter-bar__custom-input"
            type="number"
            min={0}
            value={filters.priceCustomMax}
            placeholder={t('ownerProperties.phMax')}
            onChange={(e) => setFilter('priceCustomMax', e.target.value)}
          />
        </div>
      )}
      <select className="rent-form-select rent-filter-bar__select" value={filters.areaRange} onChange={(e) => setFilter('areaRange', e.target.value)}>
        <option value="">{t('ownerProperties.allArea')}</option>
        {AREA_TIERS.map((tier) => (
          <option key={tier.key} value={tier.key}>
            {tier.key === '0-50'
              ? t('ownerProperties.areaBelow', { n: String(tier.max) })
              : tier.key === '200+'
                ? t('ownerProperties.areaAbove', { n: String(tier.min) })
                : `${tier.min}-${tier.max}㎡`}
          </option>
        ))}
        <option value="custom">{t('ownerProperties.customArea')}</option>
      </select>
      {filters.areaRange === 'custom' && (
        <div className="rent-filter-bar__custom">
          <input
            className="rent-filter-bar__custom-input"
            type="number"
            min={0}
            value={filters.areaCustomMin}
            placeholder={t('ownerProperties.phMinArea')}
            onChange={(e) => setFilter('areaCustomMin', e.target.value)}
          />
          <span className="rent-filter-bar__custom-sep">-</span>
          <input
            className="rent-filter-bar__custom-input"
            type="number"
            min={0}
            value={filters.areaCustomMax}
            placeholder={t('ownerProperties.phMaxArea')}
            onChange={(e) => setFilter('areaCustomMax', e.target.value)}
          />
        </div>
      )}
      <select className="rent-form-select rent-filter-bar__select" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
        <option value="created">{t('ownerProperties.sortCreated')}</option>
        <option value="rent-asc">{t('ownerProperties.sortRentAsc')}</option>
        <option value="rent-desc">{t('ownerProperties.sortRentDesc')}</option>
      </select>
    </div>
  )
}

export default OwnerPropertiesFilterBar
