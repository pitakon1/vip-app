/**
 * 房源列表筛选栏：顶部搜索框 + 单行筛选项（区域/价格/户型/更多/排序）+ 只看视频 + 结果计数。
 *
 * 纯结构拆分自 pages/Properties/index.tsx，面板结构、类名与交互保持不变。
 * 筛选状态本身由 hooks/usePropertyFilters 提供。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AREA_TIERS, PRICE_TIERS } from '@/constants/filters'
import { METRO_LINES } from '@/data/locationMetro'
import { FilterTab, OptGrid } from './filterWidgets'
import type { PropertyFilters } from './hooks/usePropertyFilters'

export default function PropertyFilterBar({
  filters,
  total,
  statusLabelMap,
  propertyTypeMap,
}: {
  filters: PropertyFilters
  total: number
  statusLabelMap: Record<string, string>
  propertyTypeMap: Record<string, string>
}) {
  const { t } = useTranslation()
  const f = filters

  // 当前打开的筛选 chip（单开）
  const [filterOpen, setFilterOpen] = useState('')

  const currentOptLabel = (opts: { key: string; label: string }[], value: string, fallback: string) =>
    opts.find((o) => o.key === value)?.label ?? fallback

  const STATUS_OPTS = [
    { key: '', label: t('propertiesPage.optAllStatus') },
    { key: 'rented', label: statusLabelMap.rented },
    { key: 'vacant', label: statusLabelMap.vacant },
    { key: 'renewing', label: statusLabelMap.renewing },
    { key: 'maintenance', label: statusLabelMap.maintenance },
  ]
  // 房产类型大类：与 C 端同口径（公寓=apartment+condo、商铺办公=office+shop）
  const TYPE_OPTS = [
    { key: '', label: t('propertiesPage.optAllTypes') },
    { key: 'apartment', label: t('category.rentTabApartment') },
    { key: 'villa', label: propertyTypeMap.villa },
    { key: 'commercial', label: t('category.commTitle') },
    { key: 'factory', label: propertyTypeMap.factory },
    { key: 'hotel', label: propertyTypeMap.hotel },
    { key: 'land', label: propertyTypeMap.land },
  ]
  // 业务线：公寓这类大类天然横跨租房/二手房/新房，必须单独选择
  const BIZ_OPTS = [
    { key: '', label: t('common.all') },
    { key: 'rent', label: t('category.rentTitle') },
    { key: 'resale', label: t('category.resaleTitle') },
    { key: 'new', label: t('category.newTitle') },
  ]
  const BED_OPTS = [
    { key: '', label: t('propertiesPage.optAnyBedrooms') },
    { key: '0', label: t('propertiesPage.optStudio') },
    { key: '1', label: t('propertiesPage.optBedroomsN', { n: 1 }) },
    { key: '2', label: t('propertiesPage.optBedroomsN', { n: 2 }) },
    { key: '3', label: t('propertiesPage.optBedroomsN', { n: 3 }) },
    { key: '4', label: t('propertiesPage.optBedrooms4Plus') },
  ]
  const PRICE_OPTS = [
    { key: '', label: t('propertiesPage.optAnyPrice') },
    ...PRICE_TIERS.map((tier) => ({
      key: tier.key,
      label:
        tier.key === '0-5000' ? t('propertiesPage.priceBelow5000')
        : tier.key === '50000+' ? t('propertiesPage.priceAbove50000')
        : tier.key,
    })),
    { key: 'custom', label: t('propertiesPage.customPrice') },
  ]
  const AREA_OPTS = [
    { key: '', label: t('propertiesPage.optAnyArea') },
    ...AREA_TIERS.map((tier) => ({
      key: tier.key,
      label:
        tier.key === '0-50' ? t('propertiesPage.areaBelow50')
        : tier.key === '200+' ? t('propertiesPage.areaAbove200')
        : `${tier.min}-${tier.max}㎡`,
    })),
    { key: 'custom', label: t('propertiesPage.customArea') },
  ]
  const SORT_OPTS = [
    { key: 'created', label: t('propertiesPage.sortLatest') },
    { key: 'rent-asc', label: t('propertiesPage.sortRentAsc') },
    { key: 'rent-desc', label: t('propertiesPage.sortRentDesc') },
  ]

  // 定位面板图标
  const LocIcon = ({ kind }: { kind: 'area' | 'metro' }) => (
    kind === 'area'
      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M9 8h6M6 21l1.5-3h9L18 21M8 9v2M12 9v2M16 9v2" /></svg>
  )

  // 定位面板（区域实时单选 · 地铁草稿多选，与租客端 PublicListings 一致）
  const locPanelContent = (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__tabs">
        {(['area', 'metro'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rent-loc-panel__tab ${f.locTab === tab ? 'rent-loc-panel__tab--active' : ''}`}
            onClick={() => f.setLocTab(tab)}
          >
            <LocIcon kind={tab} />
            {tab === 'area' ? t('propertiesPage.byArea') : t('propertiesPage.byMetro')}
          </button>
        ))}
      </div>

      {f.locTab === 'area' ? (
        <div className="rent-loc-panel__area">
          <div className="rent-loc-panel__lines">
            {f.countryList.map((c) => (
              <button
                key={c}
                type="button"
                className={`rent-loc-panel__line ${f.areaCountry === c ? 'rent-loc-panel__line--active' : ''}`}
                onClick={() => { f.setAreaCountry(c); f.setAreaDrill('') }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="rent-loc-panel__stations">
            {f.activeAreaGroup ? (
              <>
                <div className="rent-loc-panel__stations-head">
                  <button
                    type="button"
                    className="rent-loc-panel__back"
                    onClick={() => f.setAreaDrill('')}
                  >
                    ← {f.areaCountry}
                  </button>
                  <span className="rent-loc-panel__stations-title">{f.activeAreaGroup.cityLabel}</span>
                </div>
                <div className="rent-loc-panel__chips">
                  <button
                    type="button"
                    className={`rent-loc-panel__chip ${f.districtSel === null ? 'rent-loc-panel__chip--active' : ''}`}
                    onClick={() => f.applyDistrict(null)}
                  >
                    {t('propertiesPage.anyDistrict')}
                  </button>
                  {f.activeAreaGroup.children.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`rent-loc-panel__chip ${f.districtSel === d.key ? 'rent-loc-panel__chip--active' : ''}`}
                      onClick={() => f.applyDistrict(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="rent-loc-panel__stations-title">{f.areaCountry}</div>
                <div className="rent-loc-panel__chips">
                  {f.countryGroups.map((g) => (
                    <button
                      key={g.cityKey}
                      type="button"
                      className={`rent-loc-panel__chip ${f.areaDrill === g.cityKey ? 'rent-loc-panel__chip--active' : ''}`}
                      onClick={() => f.setAreaDrill(g.cityKey)}
                    >
                      {g.cityLabel}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rent-loc-panel__metro">
          <div className="rent-loc-panel__lines">
            {METRO_LINES.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`rent-loc-panel__line ${f.metroLine === l.key ? 'rent-loc-panel__line--active' : ''}`}
                onClick={() => f.setMetroLine(l.key)}
              >
                {l.cityLabel} · {l.name}
              </button>
            ))}
          </div>
          <div className="rent-loc-panel__stations">
            <div className="rent-loc-panel__stations-title">{f.activeLine ? `${f.activeLine.cityLabel} · ${f.activeLine.name}` : ''}</div>
            <div className="rent-loc-panel__chips">
              {f.activeLine?.stations.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`rent-loc-panel__chip ${f.metroDraft.includes(s.name) ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => f.toggleStation(s.name)}
                >
                  {s.name}
                </button>
              ))}
              {f.activeLine && !f.activeLine.stations.length && <span className="rent-loc-panel__empty">{t('propertiesPage.none')}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="rent-loc-panel__footer">
        {f.locTab === 'metro' && (
          <span className="rent-loc-panel__count">{t('propertiesPage.selectedLabel')} <strong>{f.metroDraft.length}</strong></span>
        )}
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => (f.locTab === 'metro' ? f.clearMetroDraft() : f.resetLoc())}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => (f.locTab === 'metro' ? f.confirmMetro() : f.setLocOpen(false))}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  // 价格/面积面板（复刻 C 端 rent-price-panel：快捷区间 chips + 自定义输入 + 重置/确定）
  const renderRangePanel = (kind: 'price' | 'area') => {
    const isPrice = kind === 'price'
    const opts = isPrice ? PRICE_OPTS : AREA_OPTS
    const value = isPrice ? f.priceRange : f.areaRange
    const setRange = isPrice ? f.setPriceRange : f.setAreaRange
    const min = isPrice ? f.priceCustomMin : f.areaCustomMin
    const max = isPrice ? f.priceCustomMax : f.areaCustomMax
    const setMin = isPrice ? f.setPriceCustomMin : f.setAreaCustomMin
    const setMax = isPrice ? f.setPriceCustomMax : f.setAreaCustomMax
    const reset = () => { setMin(''); setMax(''); setRange(''); setFilterOpen('') }
    const close = () => setFilterOpen('')
    const title = isPrice ? t('propertiesPage.customPrice') : t('propertiesPage.customArea')
    return (
      <div className="rent-loc-panel rent-price-panel">
        <div className="rent-loc-panel__body">
          <div className="rent-loc-panel__group">
            <div className="rent-loc-panel__group-title">{isPrice ? t('priceRange.quick') : t('browse.filterArea')}</div>
            <div className="rent-loc-panel__chips">
              {opts.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`rent-loc-panel__chip${value === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                  onClick={() => { setRange(o.key); if (o.key !== 'custom') setFilterOpen('') }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {value === 'custom' && (
            <div className="rent-loc-panel__group">
              <div className="rent-loc-panel__group-title">{title}</div>
              <div className="rent-price-custom">
                <input
                  className="rent-price-custom__input"
                  type="number"
                  min={0}
                  value={min}
                  placeholder={t(isPrice ? 'propertiesPage.minPrice' : 'propertiesPage.minArea')}
                  onChange={(e) => setMin(e.target.value)}
                />
                <span className="rent-price-custom__divider">{isPrice ? t('priceRange.to') : '-'}</span>
                <input
                  className="rent-price-custom__input"
                  type="number"
                  min={0}
                  value={max}
                  placeholder={t(isPrice ? 'propertiesPage.maxPrice' : 'propertiesPage.maxArea')}
                  onChange={(e) => setMax(e.target.value)}
                />
                <span className="rent-price-custom__unit">{isPrice ? t('priceRange.perMonth') : '㎡'}</span>
              </div>
            </div>
          )}
        </div>
        <div className="rent-loc-panel__footer">
          <div className="rent-loc-panel__actions">
            <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={reset}>
              {t('common.reset')}
            </button>
            <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={close}>
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 「更多」汇总面板：把 状态 / 类型 / 面积 三个筛选项收纳进这一个下拉层
  const morePanelContent = (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('browse.filterStatus')}</div>
          <div className="rent-loc-panel__chips">
            {STATUS_OPTS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`rent-loc-panel__chip${f.status === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                onClick={() => f.setStatus(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('browse.filterArea')}</div>
          <div className="rent-loc-panel__chips">
            {AREA_OPTS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`rent-loc-panel__chip${f.areaRange === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                onClick={() => f.setAreaRange(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {f.areaRange === 'custom' && (
          <div className="rent-loc-panel__group">
            <div className="rent-loc-panel__group-title">{t('propertiesPage.customArea')}</div>
            <div className="rent-price-custom">
              <input
                className="rent-price-custom__input"
                type="number"
                min={0}
                value={f.areaCustomMin}
                placeholder={t('propertiesPage.minArea')}
                onChange={(e) => f.setAreaCustomMin(e.target.value)}
              />
              <span className="rent-price-custom__divider">-</span>
              <input
                className="rent-price-custom__input"
                type="number"
                min={0}
                value={f.areaCustomMax}
                placeholder={t('propertiesPage.maxArea')}
                onChange={(e) => f.setAreaCustomMax(e.target.value)}
              />
              <span className="rent-price-custom__unit">㎡</span>
            </div>
          </div>
        )}
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => {
              f.setStatus(''); f.setAreaRange(''); f.setAreaCustomMin(''); f.setAreaCustomMax(''); setFilterOpen('')
            }}
          >
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setFilterOpen('')}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  // 「类型」独立入口：大类 + 业务线，切换后 chip 上直接回显当前条件（不再埋进「更多」）
  const typeTabLabel = (() => {
    const typeLabel = TYPE_OPTS.find((o) => o.key === f.typeClass)?.label
    const bizLabel = f.bizType ? BIZ_OPTS.find((o) => o.key === f.bizType)?.label : ''
    if (typeLabel && typeLabel !== t('propertiesPage.optAllTypes') && bizLabel) return `${typeLabel}·${bizLabel}`
    if (typeLabel && typeLabel !== t('propertiesPage.optAllTypes')) return typeLabel
    if (bizLabel) return bizLabel
    return t('propertiesPage.filterTypeLabel')
  })()
  const typePanelContent = (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('propertiesPage.filterTypeLabel')}</div>
          <div className="rent-loc-panel__chips">
            {TYPE_OPTS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`rent-loc-panel__chip${f.typeClass === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                onClick={() => f.setTypeClass(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-loc-panel__group">
          <div className="rent-loc-panel__group-title">{t('propertiesPage.filterBizLabel')}</div>
          <div className="rent-loc-panel__chips">
            {BIZ_OPTS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`rent-loc-panel__chip${f.bizType === o.key ? ' rent-loc-panel__chip--active' : ''}`}
                onClick={() => f.setBizType(o.key)}
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
            onClick={() => { f.setTypeClass(''); f.setBizType(''); setFilterOpen('') }}
          >
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={() => setFilterOpen('')}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* 贝壳风单行筛选栏：顶部搜索框 + 单行 text+chevron Tab（区域/类型/价格/户型/更多/排序）+ 只看视频 | 结果计数 */}
      <div className="pf-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder={t('property.searchPlaceholder')}
          value={f.keyword}
          onChange={(e) => f.setKeyword(e.target.value)}
        />
      </div>
      <div className="pf-bar">
        <div className="pf-bar__tabs">
          <FilterTab label={f.locLabel} active={!!f.activeLocationKw.length} open={f.locOpen} onOpenChange={f.onLocOpenChange}>
            {locPanelContent}
          </FilterTab>
          <FilterTab
            label={typeTabLabel}
            active={!!f.typeClass || !!f.bizType}
            open={filterOpen === 'type'}
            onOpenChange={(o) => setFilterOpen(o ? 'type' : '')}
          >
            {typePanelContent}
          </FilterTab>
          <FilterTab
            label={f.priceRange ? currentOptLabel(PRICE_OPTS, f.priceRange, t('browse.filterPrice')) : t('browse.filterPrice')}
            active={!!f.priceRange}
            open={filterOpen === 'price'}
            onOpenChange={(o) => setFilterOpen(o ? 'price' : '')}
          >
            {renderRangePanel('price')}
          </FilterTab>
          <FilterTab
            label={f.bedrooms !== '' ? currentOptLabel(BED_OPTS, f.bedrooms, t('browse.filterRoom')) : t('browse.filterRoom')}
            active={f.bedrooms !== ''}
            open={filterOpen === 'bedrooms'}
            onOpenChange={(o) => setFilterOpen(o ? 'bedrooms' : '')}
          >
            <OptGrid
              title={t('browse.filterRoom')}
              options={BED_OPTS}
              value={f.bedrooms}
              onPick={(k) => { f.setBedrooms(k); setFilterOpen('') }}
              onReset={() => { f.setBedrooms(''); setFilterOpen('') }}
              onClose={() => setFilterOpen('')}
            />
          </FilterTab>
          <FilterTab
            label={t('browse.filterMore')}
            active={!!f.status || !!f.areaRange}
            open={filterOpen === 'more'}
            onOpenChange={(o) => setFilterOpen(o ? 'more' : '')}
          >
            {morePanelContent}
          </FilterTab>
          <FilterTab
            label={f.sort !== 'created' ? currentOptLabel(SORT_OPTS, f.sort, t('browse.filterSort')) : t('browse.filterSort')}
            active={f.sort !== 'created'}
            open={filterOpen === 'sort'}
            onOpenChange={(o) => setFilterOpen(o ? 'sort' : '')}
          >
            <OptGrid
              title={t('browse.filterSort')}
              options={SORT_OPTS}
              value={f.sort}
              onPick={(k) => { f.setSort(k); setFilterOpen('') }}
              onReset={() => { f.setSort('created'); setFilterOpen('') }}
              onClose={() => setFilterOpen('')}
            />
          </FilterTab>
        </div>
        <button
          type="button"
          className="pf-video"
          data-active={f.onlyVideo}
          onClick={() => f.setOnlyVideo((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2" /><polygon points="22 7 16 11 16 13 22 17 22 7" /></svg>
          {t('propertiesPage.onlyVideo')}
        </button>
      </div>
      <div className="pf-count">
        {t('common.total')} <strong>{total}</strong> {t('property.units')}
      </div>
    </>
  )
}
