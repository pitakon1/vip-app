import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleMap, LoadScript, OverlayView } from '@react-google-maps/api'
import { useTranslation } from 'react-i18next'
import { GOOGLE_MAPS_API_KEY, isGoogleMapsConfigured } from '@/config/maps'

export interface MapCanvasPoint {
  id: string
  lat: number
  lng: number
  /** 已格式化的价格文案（气泡上直接展示） */
  priceLabel: string
}

export interface MapCanvasFocus {
  lat: number
  lng: number
  ts: number
}

export interface MapCanvasBounds {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

interface MapCanvasProps {
  center: { lat: number; lng: number }
  zoom?: number
  points: MapCanvasPoint[]
  selectedId: string | null
  focus: MapCanvasFocus | null
  /** 底部卡片条高度（px），用于把右侧控件抬到卡片上方 */
  bottomInset: number
  onSelect: (id: string) => void
  onBoundsChange: (bounds: MapCanvasBounds) => void
}

const DEFAULT_ZOOM = 13

/**
 * 贝壳式地图画布（Web / Google Maps）。
 *
 * - 价格气泡用 OverlayView 渲染成真实 DOM，样式完全可控；
 * - 首次 idle 上报视野，拖拽/缩放后同样上报（父级做 400ms 防抖）；
 * - 卡片联动居中时临时忽略视野上报，避免视野缩小把列表收缩成一条。
 */
export default function MapCanvas({
  center,
  zoom = DEFAULT_ZOOM,
  points,
  selectedId,
  focus,
  bottomInset,
  onSelect,
  onBoundsChange,
}: MapCanvasProps) {
  const { t } = useTranslation()
  const mapRef = useRef<google.maps.Map | null>(null)
  const skipBoundsUntilRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const reportBounds = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (Date.now() < skipBoundsUntilRef.current) return
    const b = map.getBounds()
    if (!b) return
    const ne = b.getNorthEast()
    const sw = b.getSouthWest()
    onBoundsChange({
      min_lat: sw.lat(),
      max_lat: ne.lat(),
      min_lng: sw.lng(),
      max_lng: ne.lng(),
    })
  }, [onBoundsChange])

  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map
      setReady(true)
      google.maps.event.addListener(map, 'idle', reportBounds)
    },
    [reportBounds],
  )

  // 卡片 / 气泡选中 → 居中该点
  useEffect(() => {
    const map = mapRef.current
    if (!focus || !map) return
    skipBoundsUntilRef.current = Date.now() + 900
    map.panTo({ lat: focus.lat, lng: focus.lng })
    if ((map.getZoom() ?? DEFAULT_ZOOM) < 14) map.setZoom(15)
  }, [focus?.ts])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.setZoom((map.getZoom() ?? DEFAULT_ZOOM) + delta)
  }

  const locate = () => {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        skipBoundsUntilRef.current = Date.now() + 900
        map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        map.setZoom(15)
      },
      () => {
        /* 拒绝定位：保持当前视野 */
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  if (!isGoogleMapsConfigured()) {
    return (
      <div className="mf-canvas mf-canvas--blocked">
        <p>{t('map.notConfigured')}</p>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="mf-canvas mf-canvas--blocked">
        <p>{t('map.loadFailed')}</p>
      </div>
    )
  }

  return (
    <div className="mf-canvas">
      <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} onError={() => setFailed(true)}>
        <GoogleMap
          mapContainerClassName="mf-canvas__map"
          center={center}
          zoom={zoom}
          onLoad={handleMapLoad}
          options={{
            disableDefaultUI: true,
            clickableIcons: false,
            gestureHandling: 'greedy',
            keyboardShortcuts: false,
          }}
        >
          {points.map((p) => {
            const on = p.id === selectedId
            return (
              <OverlayView
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(w, h) => ({ x: -w / 2, y: -h })}
              >
                <button
                  type="button"
                  className={`mf-bubble${on ? ' mf-bubble--on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(p.id)
                  }}
                  title={p.priceLabel}
                >
                  {p.priceLabel}
                </button>
              </OverlayView>
            )
          })}
        </GoogleMap>
      </LoadScript>

      {ready ? (
        <div className="mf-controls" style={{ bottom: bottomInset + 16 }}>
          <button
            type="button"
            className="mf-control"
            onClick={locate}
            aria-label={t('mapFind.locate')}
            title={t('mapFind.locate')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          <div className="mf-zoom">
            <button
              type="button"
              className="mf-zoom__btn"
              onClick={() => zoomBy(1)}
              aria-label={t('mapFind.zoomIn')}
            >
              +
            </button>
            <span className="mf-zoom__split" />
            <button
              type="button"
              className="mf-zoom__btn"
              onClick={() => zoomBy(-1)}
              aria-label={t('mapFind.zoomOut')}
            >
              −
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
