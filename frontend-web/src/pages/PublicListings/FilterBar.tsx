import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dropdown } from 'antd'
import type { ListingFilters } from './hooks/useListingFilters'
import LocationPanel from './panels/LocationPanel'
import PricePanel from './panels/PricePanel'
import MorePanel from './panels/MorePanel'
import SchoolPanel from './panels/SchoolPanel'
import SinglePanel from './panels/SinglePanel'
import TypePanel from './panels/TypePanel'

type PanelKey = 'type' | 'loc' | 'price' | 'school' | 'room' | 'more'

/**
 * 筛选栏（对齐贝壳列表页）。
 * 筛选项不再是各自独立的浮动 Popover：点击任一项，面板从筛选栏下沿整幅展开，
 * 与筛选栏同宽、同底色、无间隙；面板左侧是一级类目竖栏，右侧是当前类目的选项，
 * 底部「重置 / 确定」固定在面板底部。面板下方的列表区被遮罩压暗，筛选栏与面板保持可操作。
 * 筛选状态与请求参数仍由 useListingFilters / useListingQuery 承担，这里只改布局与连接关系。
 */
export default function FilterBar({ f, total }: { f: ListingFilters; total: number }) {
  const { t } = useTranslation()
  const {
    locOpen, onLocOpenChange, activeLocationKw, backendDistrict, regionLabel,
    propertyTypeOpen, setPropertyTypeOpen, typeLabel, typeActive, setBiz,
    propertyTypeActive, propertyTypeLabel, setPropertyTypeSel,
    schools, schoolOpen, setSchoolOpen, schoolActive, selectedSchool,
    priceOpen, setPriceOpen, priceActive, priceLabel,
    roomOpen, setRoomOpen, roomType, setRoomType, roomTypeOptions,
    moreOpen, setMoreOpen, moreActive, moreLabel,
    sort, setSort, sortItems, toMenuItems,
    videoOnly, toggleVideoOnly,
    mapOn, setMapOn,
    view, setView,
  } = f

  /** 当前展开的筛选类目：由既有弹层开合状态派生，不新增筛选状态 */
  const panelKey: PanelKey | null =
    propertyTypeOpen ? 'type'
      : locOpen ? 'loc'
        : priceOpen ? 'price'
          : schoolOpen ? 'school'
            : roomOpen ? 'room'
              : moreOpen ? 'more'
                : null

  const anchorRef = useRef<HTMLDivElement>(null)
  /** 面板可用高度：锚点下沿到视口底部，保证「重置 / 确定」始终可见 */
  const [drawerMax, setDrawerMax] = useState<number>()

  useLayoutEffect(() => {
    if (!panelKey) { setDrawerMax(undefined); return }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setDrawerMax(Math.max(220, window.innerHeight - rect.bottom - 12))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [panelKey])

  const closeAll = () => {
    setPropertyTypeOpen(false)
    onLocOpenChange(false)
    setPriceOpen(false)
    setSchoolOpen(false)
    setRoomOpen(false)
    setMoreOpen(false)
  }

  const openPanel = (key: PanelKey) => {
    if (key === panelKey) { closeAll(); return }
    closeAll()
    // 小屏上筛选栏可能在首屏较靠下的位置：先把它滚到顶部，面板才有足够展开空间（贝壳同款处理）
    if (window.innerWidth <= 1024 && anchorRef.current) {
      const anchorTop = window.scrollY + anchorRef.current.getBoundingClientRect().top - 8
      window.scrollTo({ top: anchorTop, behavior: 'smooth' })
    }
    if (key === 'type') setPropertyTypeOpen(true)
    if (key === 'loc') onLocOpenChange(true)
    if (key === 'price') setPriceOpen(true)
    if (key === 'school') setSchoolOpen(true)
    if (key === 'room') setRoomOpen(true)
    if (key === 'more') setMoreOpen(true)
  }

  /** 左侧一级类目竖栏（贝壳式）：区域 / 价格 / 户型 / 更多… */
  const rails: { key: PanelKey; label: string; show: boolean }[] = [
    { key: 'type', label: t('browse.filterType'), show: true },
    { key: 'loc', label: t('locate.area'), show: true },
    { key: 'price', label: t('browse.totalPrice'), show: true },
    { key: 'school', label: t('publicSite.filterSchool'), show: schools.length > 0 },
    { key: 'room', label: t('browse.filterRoom'), show: true },
    { key: 'more', label: t('browse.filterMore'), show: true },
  ]

  const chevron = (
    <span className="rent-filter-chip__chevron">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
    </span>
  )

  return (
    <div
      ref={anchorRef}
      className={`rent-filter-anchor ${panelKey ? 'rent-filter-anchor--open' : ''}`}
    >
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__chips">
          <button
            className={`rent-filter-chip ${typeActive ? 'rent-filter-chip--active' : ''}`}
            type="button"
            aria-expanded={propertyTypeOpen}
            onClick={() => openPanel('type')}
          >
            {typeLabel}
            {chevron}
          </button>
          {/* 已选条件回显：业务线与房产类型各自独立一个 chip，点 × 只清这一条 */}
          {f.isBizSelected && (
            <button
              type="button"
              className="rent-filter-active-chip"
              onClick={() => setBiz('all')}
              aria-label={f.bizLabel}
            >
              {f.bizLabel}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {propertyTypeActive && (
            <button
              type="button"
              className="rent-filter-active-chip"
              onClick={() => setPropertyTypeSel('')}
              aria-label={propertyTypeLabel}
            >
              {propertyTypeLabel}
              <span aria-hidden="true">×</span>
            </button>
          )}
          <button
            className={`rent-filter-chip ${activeLocationKw.length || backendDistrict ? 'rent-filter-chip--active' : ''}`}
            type="button"
            aria-expanded={locOpen}
            onClick={() => openPanel('loc')}
          >
            {regionLabel}
            {chevron}
          </button>
          <button
            className={`rent-filter-chip ${priceActive ? 'rent-filter-chip--active' : ''}`}
            type="button"
            aria-expanded={priceOpen}
            onClick={() => openPanel('price')}
          >
            {priceLabel}
            {chevron}
          </button>
          {/* 按学校找房：学校库有数据才出现这个筛选项 */}
          {schools.length > 0 && (
            <button
              className={`rent-filter-chip ${schoolActive ? 'rent-filter-chip--active' : ''}`}
              type="button"
              aria-expanded={schoolOpen}
              onClick={() => openPanel('school')}
            >
              {selectedSchool ? selectedSchool.name : t('publicSite.filterSchool')}
              {chevron}
            </button>
          )}
          <button
            className={`rent-filter-chip ${roomType ? 'rent-filter-chip--active' : ''}`}
            type="button"
            aria-expanded={roomOpen}
            onClick={() => openPanel('room')}
          >
            {roomType ? roomTypeOptions.find((o) => o.value === roomType)?.label : t('browse.filterRoom')}
            {chevron}
          </button>
          <button
            className={`rent-filter-chip ${moreActive ? 'rent-filter-chip--active' : ''}`}
            type="button"
            aria-expanded={moreOpen}
            onClick={() => openPanel('more')}
          >
            {moreLabel}
            {chevron}
          </button>
          <Dropdown
            trigger={['click']}
            placement="bottomLeft"
            onOpenChange={(open) => { if (open) closeAll() }}
            menu={{
              items: toMenuItems(sortItems),
              selectable: true,
              selectedKeys: [sort === 'default' ? 'all' : sort],
              onClick: ({ key }) => setSort(key === 'all' ? 'default' : key),
            }}
          >
            <button className={`rent-filter-chip ${sort !== 'default' ? 'rent-filter-chip--active' : ''}`} type="button">
              {sort !== 'default' ? sortItems.find((o) => o.value === sort)?.label : t('browse.filterSort')}
              {chevron}
            </button>
          </Dropdown>
        </div>
        <div className="rent-filter-bar__right">
          <button className="rv17-map-btn" type="button" data-active={videoOnly} onClick={toggleVideoOnly}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="14" height="14" rx="2" />
              <polygon points="22 7 16 11 16 13 22 17 22 7" />
            </svg>
            {t('browse.video')}
          </button>
          <button className="rv17-map-btn" type="button" data-active={mapOn} onClick={() => setMapOn((v) => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            {t('browse.mapView')}
          </button>
          <div className="rent-view-toggle">
            <button className="rent-view-toggle__btn" data-active={view === 'grid'} onClick={() => setView('grid')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
              {t('browse.viewGrid')}
            </button>
            <button className="rent-view-toggle__btn" data-active={view === 'list'} onClick={() => setView('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              {t('browse.viewList')}
            </button>
          </div>
          <span className="rent-filter-bar__count">
            {t('common.total')} <strong>{total}</strong> {t('property.units')}
          </span>
        </div>
      </div>

      {/* 面板与筛选栏下沿无缝相连：同宽、同底色、无圆角、不做浮动卡片 */}
      {panelKey && (
        <>
          <div
            className="rent-filter-drawer"
            role="dialog"
            aria-modal="true"
            style={drawerMax ? { maxHeight: drawerMax } : undefined}
          >
            <div className="rent-filter-drawer__rail">
              {rails.filter((r) => r.show).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`rent-filter-drawer__rail-btn ${panelKey === r.key ? 'rent-filter-drawer__rail-btn--active' : ''}`}
                  onClick={() => openPanel(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="rent-filter-drawer__content">
              {panelKey === 'type' && <TypePanel f={f} onClose={closeAll} />}
              {panelKey === 'loc' && <LocationPanel f={f} />}
              {panelKey === 'price' && <PricePanel f={f} />}
              {panelKey === 'school' && <SchoolPanel f={f} />}
              {panelKey === 'room' && (
                <SinglePanel
                  title={t('browse.filterRoom')}
                  options={roomTypeOptions}
                  activeKey={roomType}
                  onPick={setRoomType}
                  onClose={() => setRoomOpen(false)}
                />
              )}
              {panelKey === 'more' && <MorePanel f={f} />}
            </div>
          </div>
          {/* 遮罩只覆盖面板下方的列表区，不压到筛选栏与面板 */}
          <div className="rent-filter-mask" onClick={closeAll} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
