import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Spin, message } from 'antd'
import DataState from '@/components/DataState'
import api from '@/lib/api'
import useAuthStore, { isTokenFresh } from '@/stores/auth'
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

  // ===== 收藏：卡片上的心形必须真的落库，而不是空动作 =====
  const propertyIds = useMemo(
    () =>
      Array.from(
        new Set(
          (query.pagedItems as any[])
            .map((it) => it.property_id || '')
            .filter(Boolean),
        ),
      ),
    [query.pagedItems],
  )
  const [favOverride, setFavOverride] = useState<Record<string, boolean>>({})
  const favQ = useQuery({
    queryKey: ['public-listings-fav', user?.id ?? 'anon', propertyIds.join(',')],
    // 未登录 / 令牌已过期时不发收藏状态请求，避免匿名浏览稳定报 401
    enabled: isTokenFresh(token) && propertyIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await api.get('/favorites/status', { params: { property_ids: propertyIds.join(',') } })
      const payload = res.data?.data ?? res.data
      return new Set<string>(
        (payload?.items ?? [])
          .filter((x: any) => x.favorited)
          .map((x: any) => String(x.property_id)),
      )
    },
  })
  const favSet = favQ.data ?? new Set<string>()
  const isFavorite = (item: any) =>
    favOverride[item.property_id] ?? favSet.has(String(item.property_id || ''))

  const toggleFavorite = async (item: any) => {
    if (!item?.property_id) return
    if (!token) {
      message.info(t('browse.loginRequired'))
      navigate('/login')
      return
    }
    const next = !isFavorite(item)
    setFavOverride((prev) => ({ ...prev, [item.property_id]: next }))
    try {
      if (next) await api.post('/favorites', { property_id: item.property_id })
      else await api.delete(`/favorites/${item.property_id}`)
    } catch {
      setFavOverride((prev) => ({ ...prev, [item.property_id]: !next }))
      message.error(t('browse.favFailed'))
    }
  }

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
          biz={filters.isSaleBiz ? 'sale' : 'rent'}
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
                emptyTitle={query.hasActiveFilter ? t('browse.emptyFiltered') : t('browse.emptyNone')}
                emptySub={query.hasActiveFilter ? t('browse.emptyFilteredSub') : undefined}
                emptyAction={
                  query.hasActiveFilter ? (
                    <button type="button" className="rent-btn rent-btn--secondary" onClick={filters.resetAll}>
                      {t('browse.clearFilters')}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="rent-prop-grid">
                {query.pagedItems.map((item: any) => (
                  <PropertyCard
                    key={item.id}
                    item={item}
                    biz={filters.isSaleBiz ? 'sale' : 'rent'}
                    schoolId={filters.schoolId}
                    onClick={handleCardClick}
                    propertyTypeMap={propertyTypeMap}
                    statusLabelMap={statusLabelMap}
                    favorited={isFavorite(item)}
                    onToggleFavorite={toggleFavorite}
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
