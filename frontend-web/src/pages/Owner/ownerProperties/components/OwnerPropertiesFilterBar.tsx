import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import FilterBar from '@/components/FilterBar'
import { AREA_TIERS, PRICE_TIERS } from '@/constants/filters'
import type { OwnerPropertyFilters } from '../types'

export type SetOwnerPropertyFilter = <K extends keyof OwnerPropertyFilters>(
  key: K,
  value: OwnerPropertyFilters[K],
) => void

interface Props {
  filters: OwnerPropertyFilters
  setFilter: SetOwnerPropertyFilter
  total?: number
}

/** Filter Bar（与租客端 / 管理员端统一：搜索 + 点击就地展开的面板） */
const OwnerPropertiesFilterBar = ({ filters, setFilter, total }: Props) => {
  const { t } = useTranslation()
  const [openKey, setOpenKey] = useState<string | null>(null)

  const STATUS_OPTS = [
    { key: '', label: t('ownerProperties.allStatus') },
    { key: 'rented', label: t('ownerProperties.stRented') },
    { key: 'vacant', label: t('ownerProperties.stVacant') },
    { key: 'renewing', label: t('ownerProperties.stRenewing') },
    { key: 'maintenance', label: t('ownerProperties.stMaintenance') },
  ]
  const BED_OPTS = [
    { key: '', label: t('ownerProperties.allLayout') },
    { key: '0', label: t('ownerProperties.layoutStudio') },
    { key: '1', label: t('ownerProperties.layoutRoom', { n: 1 }) },
    { key: '2', label: t('ownerProperties.layoutRoom', { n: 2 }) },
    { key: '3', label: t('ownerProperties.layoutRoom', { n: 3 }) },
    { key: '4', label: t('ownerProperties.layout4Plus') },
  ]
  const PRICE_OPTS = [
    { key: '', label: t('ownerProperties.allPrice') },
    ...PRICE_TIERS.map((tier) => ({
      key: tier.key,
      label:
        tier.key === '0-5000'
          ? t('ownerProperties.priceBelow', { n: String(tier.max) })
          : tier.key === '50000+'
            ? t('ownerProperties.priceAbove', { n: String(tier.min) })
            : `${tier.min}-${tier.max}`,
    })),
    { key: 'custom', label: t('ownerProperties.customPrice') },
  ]
  const AREA_OPTS = [
    { key: '', label: t('ownerProperties.allArea') },
    ...AREA_TIERS.map((tier) => ({
      key: tier.key,
      label:
        tier.key === '0-50'
          ? t('ownerProperties.areaBelow', { n: String(tier.max) })
          : tier.key === '200+'
            ? t('ownerProperties.areaAbove', { n: String(tier.min) })
            : `${tier.min}-${tier.max}㎡`,
    })),
    { key: 'custom', label: t('ownerProperties.customArea') },
  ]
  const SORT_OPTS = [
    { key: 'created', label: t('ownerProperties.sortCreated') },
    { key: 'rent-asc', label: t('ownerProperties.sortRentAsc') },
    { key: 'rent-desc', label: t('ownerProperties.sortRentDesc') },
  ]

  const close = () => setOpenKey(null)
  const labelOf = (opts: { key: string; label: string }[], value: string) =>
    opts.find((o) => o.key === value)?.label ?? opts[0].label

  const chips = (
    opts: { key: string; label: string }[],
    value: string,
    onPick: (key: string) => void,
    onReset: () => void,
  ) => (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__chips">
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`rent-loc-panel__chip${value === o.key ? ' rent-loc-panel__chip--active' : ''}`}
              onClick={() => onPick(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={onReset}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={close}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
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
      </div>

      <FilterBar
        openKey={openKey}
        onOpenChange={setOpenKey}
        tabs={[
          {
            key: 'status',
            label: labelOf(STATUS_OPTS, filters.status),
            active: !!filters.status,
            panel: chips(STATUS_OPTS, filters.status, (k) => setFilter('status', k), () => setFilter('status', '')),
          },
          {
            key: 'bedrooms',
            label: labelOf(BED_OPTS, filters.bedrooms),
            active: filters.bedrooms !== '',
            panel: chips(BED_OPTS, filters.bedrooms, (k) => setFilter('bedrooms', k), () => setFilter('bedrooms', '')),
          },
          {
            key: 'price',
            label: labelOf(PRICE_OPTS, filters.priceRange),
            active: !!filters.priceRange,
            panel: (
              <div className="rent-loc-panel">
                <div className="rent-loc-panel__body">
                  <div className="rent-loc-panel__chips">
                    {PRICE_OPTS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        className={`rent-loc-panel__chip${filters.priceRange === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                        onClick={() => setFilter('priceRange', o.key)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {filters.priceRange === 'custom' && (
                    <div className="rent-price-custom" style={{ marginTop: 12 }}>
                      <input
                        className="rent-price-custom__input"
                        type="number"
                        min={0}
                        value={filters.priceCustomMin}
                        placeholder={t('ownerProperties.phMin')}
                        onChange={(e) => setFilter('priceCustomMin', e.target.value)}
                      />
                      <span className="rent-price-custom__divider">-</span>
                      <input
                        className="rent-price-custom__input"
                        type="number"
                        min={0}
                        value={filters.priceCustomMax}
                        placeholder={t('ownerProperties.phMax')}
                        onChange={(e) => setFilter('priceCustomMax', e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="rent-loc-panel__footer">
                  <div className="rent-loc-panel__actions">
                    <button
                      type="button"
                      className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
                      onClick={() => {
                        setFilter('priceRange', '')
                        setFilter('priceCustomMin', '')
                        setFilter('priceCustomMax', '')
                      }}
                    >
                      {t('common.reset')}
                    </button>
                    <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={close}>
                      {t('common.confirm')}
                    </button>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'area',
            label: labelOf(AREA_OPTS, filters.areaRange),
            active: !!filters.areaRange,
            panel: (
              <div className="rent-loc-panel">
                <div className="rent-loc-panel__body">
                  <div className="rent-loc-panel__chips">
                    {AREA_OPTS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        className={`rent-loc-panel__chip${filters.areaRange === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                        onClick={() => setFilter('areaRange', o.key)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {filters.areaRange === 'custom' && (
                    <div className="rent-price-custom" style={{ marginTop: 12 }}>
                      <input
                        className="rent-price-custom__input"
                        type="number"
                        min={0}
                        value={filters.areaCustomMin}
                        placeholder={t('ownerProperties.phMinArea')}
                        onChange={(e) => setFilter('areaCustomMin', e.target.value)}
                      />
                      <span className="rent-price-custom__divider">-</span>
                      <input
                        className="rent-price-custom__input"
                        type="number"
                        min={0}
                        value={filters.areaCustomMax}
                        placeholder={t('ownerProperties.phMaxArea')}
                        onChange={(e) => setFilter('areaCustomMax', e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="rent-loc-panel__footer">
                  <div className="rent-loc-panel__actions">
                    <button
                      type="button"
                      className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
                      onClick={() => {
                        setFilter('areaRange', '')
                        setFilter('areaCustomMin', '')
                        setFilter('areaCustomMax', '')
                      }}
                    >
                      {t('common.reset')}
                    </button>
                    <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={close}>
                      {t('common.confirm')}
                    </button>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'sort',
            label: labelOf(SORT_OPTS, filters.sort),
            active: filters.sort !== 'created',
            panel: chips(SORT_OPTS, filters.sort, (k) => setFilter('sort', k), () => setFilter('sort', 'created')),
          },
        ]}
        right={
          total != null ? (
            <span className="rent-filter-bar__count">
              {t('common.total')} <strong>{total}</strong> {t('property.units')}
            </span>
          ) : undefined
        }
      />
    </>
  )
}

export default OwnerPropertiesFilterBar
