import { useTranslation } from 'react-i18next'
import { Spin } from 'antd'
import GoogleMapView, { type MapMarker, type MapBounds } from '@/components/GoogleMap'
import { formatMoney } from '@/lib/money'
import type { Pos } from './types'

/**
 * 地图模式（Google Maps：搜索 / 路线 / 定位）。
 * 按需挂载：`mapOn` 为真才创建 GoogleMapView。
 */
export default function MapSection({
  mapOn,
  center,
  zoom,
  markers,
  points,
  loading,
  onBoundsChanged,
  onMarkerClick,
  onPointClick,
  pointName,
}: {
  mapOn: boolean
  center: Pos
  zoom?: number
  markers: MapMarker[]
  points: any[]
  loading: boolean
  onBoundsChanged: (b: MapBounds) => void
  onMarkerClick: (marker: MapMarker) => void
  onPointClick: (p: any) => void
  pointName: (p: any) => string
}) {
  const { t } = useTranslation()

  return (
    <section className="rv17-map" data-active={mapOn}>
      <div style={{
        position: 'absolute',
        bottom: 92,
        right: 12,
        zIndex: 5,
        padding: '4px 12px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.92)',
        fontSize: 11,
        color: 'var(--rent-ink-2, #64748b)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
      }}>
        {t('browse.mapLegend')} · {markers.length} {t('property.units')}
      </div>
      <div className="rv17-map__canvas">
        {/* 地图按需挂载：`mapOn` 为真才创建 GoogleMapView。
            此前无条件挂载（只靠 CSS data-active 隐藏），意味着每次打开列表页
            都会初始化 Google Maps——没有可用 Key 时会在 mount 阶段抛错并把
            整页拖白。浏览入口不该由一个「可选的」功能决定能不能打开。 */}
        {mapOn && (
          <GoogleMapView
            center={center}
            zoom={zoom}
            markers={markers}
            onBoundsChanged={onBoundsChanged}
            onMarkerClick={onMarkerClick}
          />
        )}
      </div>
      {loading && (
        <div className="rv17-map__loading">
          <Spin />
        </div>
      )}
      {!loading && markers.length === 0 && (
        <div className="rv17-map__empty">{t('browse.mapNoCoord')}</div>
      )}
      <div className="rv17-map__strip">
        {points.slice(0, 6).map((p: any) => (
          <div key={p.id} className="rv17-map__mini" onClick={() => onPointClick(p)}>
            <div className="rv17-map__mini-name">{pointName(p)}</div>
            {/* 传 p.currency：漏传会一律按 THB 渲染，马币/美元房源会显示成 ฿ */}
            <div className="rv17-map__mini-price">{formatMoney(Number(p.monthly_rent || 0), p.currency || undefined)}</div>
            <span className="rv17-map__mini-tag">{p.video_url ? t('browse.video') : (p.project_name || '')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
