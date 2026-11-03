import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { MAP_LIMIT } from '@/lib/pagination'
import { BANGKOK_CENTER } from '@/constants/location'
import type { MapMarker, MapBounds } from '@/components/GoogleMap'
import type { ListingFilters } from './useListingFilters'
import type { ListingQuery } from './useListingQuery'

/**
 * 地图找房点位：与列表共用筛选（仅取地图接口支持的参数），按当前视野拉取。
 * 房源坐标来自所属项目（projects.lat/lng），项目未维护坐标的房源不在地图上出现。
 */
export function useMapPoints(f: ListingFilters, query: ListingQuery) {
  const { listingType, citySel, vrSel, featuredSel, ownerDirectSel, mapOn } = f
  const { queryParams } = query

  const [mapPoints, setMapPoints] = useState<any[]>([])
  const [mapLoading, setMapLoading] = useState(false)
  // 地图当前视野（由 GoogleMap 视野变化回调写入），只拉当前视野内的点位
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)

  // 地图与列表共用同一套筛选（仅取地图接口支持的参数）
  const mapParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: MAP_LIMIT,
      listing_type: listingType,
      city: citySel.cityKey,
    }
    ;(['q', 'keywords', 'district', 'price_min', 'price_max', 'has_video'] as const).forEach((k) => {
      if (queryParams[k] !== undefined) params[k] = queryParams[k]
    })
    if (vrSel === '1') params.has_vr = true
    if (featuredSel === '1') params.is_featured = true
    if (ownerDirectSel === '1') params.owner_direct = true
    if (mapBounds) {
      params.min_lat = mapBounds.minLat
      params.max_lat = mapBounds.maxLat
      params.min_lng = mapBounds.minLng
      params.max_lng = mapBounds.maxLng
    }
    return params
  }, [queryParams, listingType, citySel.cityKey, vrSel, featuredSel, ownerDirectSel, mapBounds])

  // 地图点位名称（点位来自 /public/map-points，带 project_name）
  const mapPointName = (p: any): string =>
    p.project_name ? `${p.project_name} · ${p.room_number || ''}` : (p.address || p.room_number || '—')

  const fetchMapPoints = useCallback(async () => {
    setMapLoading(true)
    try {
      // /properties/map-points 强制鉴权，匿名点「地图找房」必然 401，
      // 这是「浏览不需注册」在接口层漏掉的一处，改走公开点位接口。
      const res = await api.get('/public/map-points', { params: mapParams })
      setMapPoints(Array.isArray(res.data) ? res.data : [])
    } catch {
      setMapPoints([])
    } finally {
      setMapLoading(false)
    }
  }, [mapParams])

  useEffect(() => { if (mapOn) fetchMapPoints() }, [mapOn, fetchMapPoints])

  // 视野变化 → 防抖后更新 bounds，避免拖拽过程中打出请求风暴
  const boundsTimer = useRef<number | null>(null)
  const onMapBoundsChanged = useCallback((b: MapBounds) => {
    if (boundsTimer.current) window.clearTimeout(boundsTimer.current)
    boundsTimer.current = window.setTimeout(() => setMapBounds(b), 500)
  }, [])
  useEffect(() => () => { if (boundsTimer.current) window.clearTimeout(boundsTimer.current) }, [])

  // 透传给 GoogleMap 组件的标注点（坐标转数字）
  const mapMarkers = useMemo<MapMarker[]>(
    () =>
      mapPoints
        .filter((p) => !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng)))
        .map((p) => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), title: mapPointName(p) })),
    [mapPoints],
  )

  // 地图视图默认中心（曼谷）
  const GOOGLE_MAP_CENTER = BANGKOK_CENTER

  return { mapPoints, mapLoading, mapMarkers, mapPointName, onMapBoundsChanged, GOOGLE_MAP_CENTER }
}
