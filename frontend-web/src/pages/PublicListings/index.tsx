import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spin } from 'antd'
import DataState from '@/components/DataState'
import useAuthStore from '@/stores/auth'
import { usePropertyStatusMap, usePropertyTypeMap } from '@/lib/enumLabels'
import { useListingFilters } from './hooks/useListingFilters'
import { useListingQuery } from './hooks/useListingQuery'
import { useMapPoints } from './hooks/useMapPoints'
import PortalHeader from './PortalHeader'
import SearchHero from './SearchHero'
import FilterBar from './FilterBar'
import MapSection from './MapSection'
import PropertyCard from './PropertyCard'
import ListingPagination from './ListingPagination'
import CtaSection from './CtaSection'
import PortalFooter from './PortalFooter'
import './public-listings.css'

/**
 * 公开房源列表（C 端浏览页）。
 *
 * 纯结构拆分：本文件只保留编排与页面级挂载，
 * 筛选状态、服务端查询参数、地图点位与各区块视图均落在本页面私有目录内。
 * 所有筛选条件仍由 useListingQuery 统一拼进 `/public/listings` 的请求参数。
 */

const PublicListings = ({ compact }: { compact?: boolean }) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user } = useAuthStore()

  const filters = useListingFilters()
  const query = useListingQuery(filters)
  const map = useMapPoints(filters, query)

  const statusLabelMap = usePropertyStatusMap()
  const propertyTypeMap = usePropertyTypeMap()

  // 切换业务 / 城市时清空区域选择（区域候选集会变，旧选值可能已不在列表里）
  useEffect(() => {
    filters.setBackendDistrict(null)
    filters.setDistrictSel(null)
  }, [filters.listingType, filters.citySel.cityKey])

  const enterSystem = useCallback(() => {
    if (!token) { navigate('/login'); return }
    const role = user?.role
    switch (role) {
      // 业主与租客统一到同一个 C 端门户首页
      case 'owner': navigate('/tenant/dashboard'); break
      case 'tenant': navigate('/tenant/dashboard'); break
      case 'employee': navigate('/employee/dashboard'); break
      default: navigate('/dashboard')
    }
  }, [token, user, navigate])

  const handleCardClick = (item: any) => {
    // 浏览全开放：匿名与登录用户统一进 C 端公开详情页。
    // 此前未登录会直接被弹到登录页，等于把列表页的出口堵死；
    // 登录用户要看自己的租约 / 账单走门户菜单，不在这里按角色分流。
    navigate(`/listing/${item.id}`)
  }

  return (
    <div className={compact ? 'rent-portal rent-portal--compact' : 'rent-portal'}>
      {/* ===== 顶栏（对齐原型 rent-portal__header）——compact 模式由外层 PortalLayout 提供，此处跳过 ===== */}
      {!compact && (
        <PortalHeader
          biz={filters.biz}
          videoOnly={filters.videoOnly}
          token={token}
          onEnterSystem={enterSystem}
        />
      )}

      <main className="rent-portal__main">
        <SearchHero
          keyword={filters.keyword}
          onKeywordChange={filters.setKeyword}
          onSearch={() => query.setPage(1)}
        />

        <FilterBar f={filters} total={query.total} />

        <MapSection
          mapOn={filters.mapOn}
          center={map.GOOGLE_MAP_CENTER}
          zoom={11}
          markers={map.mapMarkers}
          points={map.mapPoints}
          loading={map.mapLoading}
          onBoundsChanged={map.onMapBoundsChanged}
          onMarkerClick={(m) => {
            const item = map.mapPoints.find((p) => String(p.id) === String(m?.id))
            if (item) handleCardClick(item)
          }}
          onPointClick={handleCardClick}
          pointName={map.mapPointName}
        />

        {/* ===== 房源卡片网格（对齐原型 rent-prop-grid） ===== */}
        <section className="rent-section">
          <Spin spinning={query.loading} tip={t('common.loading')}>
            {query.listQ.isError && !query.listQ.data ? (
              <DataState
                error={t('common.loadFailed')}
                retryText={t('common.retry')}
                onRetry={() => query.listQ.refetch()}
              />
            ) : query.total === 0 && !query.loading ? (
              <DataState
                empty
                filtered={query.hasActiveFilter}
                emptyTitle={t('common.noData')}
              />
            ) : (
              <div className="rent-prop-grid">
                {query.pagedItems.map((item: any) => (
                  <PropertyCard
                    key={item.id}
                    item={item}
                    biz={filters.biz}
                    schoolId={filters.schoolId}
                    onClick={handleCardClick}
                    propertyTypeMap={propertyTypeMap}
                    statusLabelMap={statusLabelMap}
                  />
                ))}
              </div>
            )}
          </Spin>

          {/* ===== 自定义分页（对齐原型 rent-pagination） ===== */}
          {query.total > 0 && (
            <ListingPagination
              page={query.page}
              pageCount={query.pageCount}
              pageNumbers={query.pageNumbers}
              total={query.total}
              setPage={query.setPage}
            />
          )}
        </section>

        <CtaSection token={token} onEnterSystem={enterSystem} />
      </main>

      <PortalFooter />
    </div>
  )
}

export default PublicListings
