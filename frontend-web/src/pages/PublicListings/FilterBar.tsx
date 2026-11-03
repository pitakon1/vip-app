import { useTranslation } from 'react-i18next'
import { Dropdown, Popover } from 'antd'
import type { ListingFilters } from './hooks/useListingFilters'
import LocationPanel from './panels/LocationPanel'
import PricePanel from './panels/PricePanel'
import MorePanel from './panels/MorePanel'
import SchoolPanel from './panels/SchoolPanel'
import SinglePanel from './panels/SinglePanel'

/**
 * 筛选栏（对齐原型 rent-filter-bar + rv17-bizbar + chips）。
 * 只做展示与弹层挂载，筛选状态与请求参数均由 useListingFilters / useListingQuery 承担。
 */
export default function FilterBar({ f, total }: { f: ListingFilters; total: number }) {
  const { t } = useTranslation()
  const {
    biz, setBiz, bizTabs,
    locOpen, onLocOpenChange, activeLocationKw, backendDistrict, regionLabel,
    schools, schoolOpen, setSchoolOpen, schoolActive, selectedSchool,
    priceOpen, setPriceOpen, priceActive, priceLabel,
    roomOpen, setRoomOpen, roomType, setRoomType, roomTypeOptions,
    moreOpen, setMoreOpen, moreActive, moreLabel,
    sort, setSort, sortItems, toMenuItems,
    videoOnly, toggleVideoOnly,
    mapOn, setMapOn,
    view, setView,
  } = f

  return (
    <div className="rent-filter-bar">
      <div className="rv17-bizbar">
        {bizTabs.map((b) => (
          <button
            key={b.value}
            className="rv17-bizbar__item"
            type="button"
            data-active={biz === b.value}
            onClick={() => setBiz(b.value)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="rent-filter-bar__chips">
        <Popover
          trigger="click"
          open={locOpen}
          onOpenChange={onLocOpenChange}
          placement="bottomLeft"
          overlayClassName="rent-loc-popover"
          content={<LocationPanel f={f} />}
        >
          <button
            className={`rent-filter-chip ${activeLocationKw.length || backendDistrict ? 'rent-filter-chip--active' : ''}`}
            type="button"
          >
            {regionLabel}
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
        </Popover>
        {/* 小区筛选已移除：小区名走顶部搜索框（后端 q 参数已 OR 匹配小区名） */}
        {/* 按学校找房：学校库有数据才出现这个筛选项 */}
        {schools.length > 0 && (
          <Popover
            trigger="click"
            open={schoolOpen}
            onOpenChange={setSchoolOpen}
            placement="bottomLeft"
            overlayClassName="rent-loc-popover"
            content={<SchoolPanel f={f} />}
          >
            <button className={`rent-filter-chip ${schoolActive ? 'rent-filter-chip--active' : ''}`} type="button">
              {selectedSchool ? selectedSchool.name : t('publicSite.filterSchool')}
              <span className="rent-filter-chip__chevron">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </span>
            </button>
          </Popover>
        )}
        <Popover
          trigger="click"
          open={priceOpen}
          onOpenChange={setPriceOpen}
          placement="bottomLeft"
          overlayClassName="rent-loc-popover"
          content={<PricePanel f={f} />}
        >
          <button className={`rent-filter-chip ${priceActive ? 'rent-filter-chip--active' : ''}`} type="button">
            {priceLabel}
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
        </Popover>
        <Popover
          trigger="click"
          open={roomOpen}
          onOpenChange={setRoomOpen}
          placement="bottomLeft"
          overlayClassName="rent-loc-popover"
          content={
            <SinglePanel
              title={t('browse.filterRoom')}
              options={roomTypeOptions}
              activeKey={roomType}
              onPick={setRoomType}
              onClose={() => setRoomOpen(false)}
            />
          }
        >
          <button className={`rent-filter-chip ${roomType ? 'rent-filter-chip--active' : ''}`} type="button">
            {roomType ? roomTypeOptions.find((o) => o.value === roomType)?.label : t('browse.filterRoom')}
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
        </Popover>
        <Popover
          trigger="click"
          open={moreOpen}
          onOpenChange={setMoreOpen}
          placement="bottomLeft"
          overlayClassName="rent-loc-popover"
          content={<MorePanel f={f} />}
        >
          <button className={`rent-filter-chip ${moreActive ? 'rent-filter-chip--active' : ''}`} type="button">
            {moreLabel}
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
        </Popover>
        <Dropdown trigger={['click']} placement="bottomLeft" menu={{
          items: toMenuItems(sortItems),
          selectable: true,
          selectedKeys: [sort === 'default' ? 'all' : sort],
          onClick: ({ key }) => setSort(key === 'all' ? 'default' : key),
        }}>
          <button className={`rent-filter-chip ${sort !== 'default' ? 'rent-filter-chip--active' : ''}`} type="button">
            {sort !== 'default' ? sortItems.find((o) => o.value === sort)?.label : t('browse.filterSort')}
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
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
  )
}
