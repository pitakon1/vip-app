import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Autocomplete,
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  LoadScript,
} from '@react-google-maps/api'
import { isGoogleMapsConfigured, GOOGLE_MAPS_API_KEY } from '@/config/maps'

/** 通用透传点位（房源标注等，props 驱动，不写死业务） */
export interface MapMarker {
  id?: string | number
  lat: number
  lng: number
  title?: string
}

interface Pos {
  lat: number
  lng: number
}

interface GoogleMapViewProps {
  /** 初始/受控地图中心（曼谷等） */
  center: Pos
  /** 初始缩放级别 */
  zoom?: number
  /** 外部传入的标注点集合 */
  markers?: MapMarker[]
  /** 点击标注点的回调 */
  onMarkerClick?: (marker: MapMarker) => void
  /** 地图容器样式（需含高度） */
  mapContainerStyle?: CSSProperties
}

const DEFAULT_ZOOM = 12
const DEFAULT_HEIGHT = 420

/**
 * 通用 Google Maps 组件（搜索 / 路线 / 定位）。
 * - 搜索：Places Autocomplete，选中后地图平移并落一个定位点
 * - 路线：DirectionsService + DirectionsRenderer，起终点均可填，失败给出可见错误
 * - 定位：navigator.geolocation + Geocoder 反地理编码，把坐标转成地址显示在 GUI
 * 组件本身不包含任何业务逻辑，全部经由 props 驱动。
 */
function GoogleMapView({
  center,
  zoom = DEFAULT_ZOOM,
  markers = [],
  onMarkerClick,
  mapContainerStyle,
}: GoogleMapViewProps) {
  const { t } = useTranslation()
  const [mapCenter, setMapCenter] = useState<Pos>(center)
  const mapRef = useRef<google.maps.Map | null>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  // 脚本加载状态：`window.google` 只有在脚本真正 load 成功后才存在。
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // 搜索/定位命中的居中区域点，GUI 上展示其地址
  const [focus, setFocus] = useState<{ pos: Pos; label: string } | null>(null)
  const [locating, setLocating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // 路线
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [route, setRoute] = useState<google.maps.DirectionsResult | null>(null)
  const [routeError, setRouteError] = useState('')
  const [requesting, setRequesting] = useState(false)

  // 外部 center 变化时同步本地状态
  useEffect(() => {
    setMapCenter(center)
  }, [center])

  const onMapLoad = (map: google.maps.Map) => {
    mapRef.current = map
  }

  const onAutocompleteLoad = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete
  }

  // 搜索：选中建议后把地图平移到结果并落点
  const onPlacesChanged = () => {
    const place = autocompleteRef.current?.getPlace()
    const location = place?.geometry?.location
    if (!location) {
      // 无 geometry（例如输入不可解析）时给出可见提示，不静默
      setRouteError(t('map.searchError'))
      return
    }
    const pos = { lat: location.lat(), lng: location.lng() }
    mapRef.current?.panTo(pos)
    mapRef.current?.setZoom(15)
    const label = place.formatted_address || place.name || ''
    setFocus({ pos, label })
    setRouteError('')
  }

  // 定位：获取当前坐标 + 反地理编码为地址
  const locate = () => {
    if (!navigator.geolocation) {
      setStatusMsg(t('map.locUnsupported'))
      return
    }
    setLocating(true)
    setStatusMsg('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude }
        mapRef.current?.panTo(pos)
        mapRef.current?.setZoom(16)
        const fallback = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`
        try {
          const geocoder = new google.maps.Geocoder()
          geocoder.geocode({ location: pos }, (results, status) => {
            const addr = results && results[0]?.formatted_address
            setFocus({ pos, label: status === 'OK' && addr ? addr : fallback })
          })
        } catch {
          // 占位 Key / 脚本未加载时 Geocoder 不可用，退化为展示坐标
          setFocus({ pos, label: fallback })
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setStatusMsg(t('map.locDenied'))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
  }

  // 路线：校验起终点后发起 Directions 请求
  const drawRoute = () => {
    if (!origin.trim() || !destination.trim()) {
      setRouteError(t('map.routeFillBoth'))
      return
    }
    setRouteError('')
    setRequesting(true)
  }

  const clearRoute = () => {
    setRoute(null)
    setRouteError('')
    setRequesting(false)
    setOrigin('')
    setDestination('')
  }

  // DirectionsService 回调：失败（含地理编码失败）给出可见错误文案
  const onRouteResult = (
    result: google.maps.DirectionsResult | null,
    status: google.maps.DirectionsStatus,
  ) => {
    setRequesting(false)
    if (status === 'OK' && result) {
      setRoute(result)
      setRouteError('')
    } else {
      setRouteError(t('map.routeError'))
    }
  }

  // 控件与容器样式
  const mapStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    ...mapContainerStyle,
  }
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontFamily:
      "'Segoe UI','PingFang SC','Microsoft YaHei',Roboto,sans-serif",
  }
  const rowStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  }
  const inputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: 36,
    padding: '0 12px',
    border: '1px solid var(--rent-line, #e2e8f0)',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--rent-ink, #1c2733)',
    background: '#fff',
    outline: 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
  }
  const routeInputStyle: CSSProperties = {
    ...inputStyle,
    flex: 1,
    height: 32,
    fontSize: 12,
  }
  const btnStyle: CSSProperties = {
    height: 36,
    padding: '0 12px',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    color: '#fff',
    background: 'var(--rent-primary, #14b8a6)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    opacity: locating ? 0.6 : 1,
  }
  const ghostBtnStyle: CSSProperties = {
    height: 36,
    padding: '0 12px',
    border: '1px solid var(--rent-line, #e2e8f0)',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--rent-ink, #1c2733)',
    background: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
  }
  const statusBarStyle: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12,
    background: 'rgba(255,255,255,0.95)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
  }
  const focusStyle: CSSProperties = {
    ...statusBarStyle,
    color: 'var(--rent-ink, #1c2733)',
  }
  const errorStyle: CSSProperties = {
    ...statusBarStyle,
    color: '#dc2626',
    border: '1px solid #fecaca',
  }

  // 未配置可用 Key 时直接给明确占位，**不挂载任何 Google 组件**。
  // 否则 <Autocomplete> mount 时会读 window.google.places → 抛 ReferenceError，
  // 未被 ErrorBoundary 接住的话 React 卸载整棵组件树，整页白屏。
  if (!isGoogleMapsConfigured()) {
    return (
      <div
        style={{
          ...mapStyle,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: DEFAULT_HEIGHT,
          background: 'var(--rent-surface-2, #f4f1ec)',
          border: '1px dashed var(--rent-line, #ece7df)',
          color: 'var(--rent-ink-2, #55606c)',
          fontSize: 13,
        }}
      >
        <span style={{ fontSize: 22 }}>🗺️</span>
        <span>{t('map.notConfigured')}</span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: DEFAULT_HEIGHT }}>
      <LoadScript
        googleMapsApiKey={GOOGLE_MAPS_API_KEY}
        libraries={['places']}
        onLoad={() => setScriptLoaded(true)}
        onError={() => setLoadError(true)}
        loadingElement={
          <div style={mapStyle}>{t('map.mapLoading')}</div>
        }
      >
        <GoogleMap
          mapContainerStyle={mapStyle}
          center={mapCenter}
          zoom={zoom}
          onLoad={onMapLoad}
        >
          {/* 外部标注（房源等） */}
          {markers.map((m) => (
            <Marker
              key={m.id ?? `${m.lat}-${m.lng}`}
              position={{ lat: m.lat, lng: m.lng }}
              title={m.title}
              icon={{
                url: 'http://maps.google.com/mapfiles/ms/icons/teal-dot.png',
                scaledSize: new google.maps.Size(24, 24),
              }}
              onClick={() => onMarkerClick?.(m)}
            />
          ))}
          {/* 搜索/定位命中点 */}
          {focus && (
            <Marker
              position={focus.pos}
              title={focus.label}
              icon={{
                url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                scaledSize: new google.maps.Size(28, 28),
              }}
            />
          )}
          {/* 路线 */}
          {route && <DirectionsRenderer directions={route} options={{ polylineOptions: { strokeColor: '#2563eb', strokeWeight: 6 } }} />}
          {requesting && origin && destination && (
            <DirectionsService
              options={{ origin, destination, travelMode: google.maps.TravelMode.DRIVING }}
              callback={onRouteResult}
            />
          )}
        </GoogleMap>

        {/* 覆盖控件：搜索 + 定位 + 路线。
            必须留在 LoadScript 内部——<Autocomplete> 的 componentDidMount 直接读
            window.google.maps.places，放在 LoadScript 外面会在脚本就绪前 mount 并抛错。 */}
        {scriptLoaded && (
        <div style={overlayStyle}>
        <div style={rowStyle}>
          <Autocomplete
            onLoad={onAutocompleteLoad}
            onPlaceChanged={onPlacesChanged}
          >
            <input
              type="text"
              style={inputStyle}
              placeholder={t('map.searchPlaceholder')}
            />
          </Autocomplete>
          <button type="button" style={btnStyle} onClick={locate} disabled={locating}>
            {t('map.myLocation')}
          </button>
        </div>

        {focus && <div style={focusStyle}>📍 {focus.label}</div>}

        <div style={rowStyle}>
          <input
            type="text"
            style={routeInputStyle}
            value={origin}
            placeholder={t('map.origin')}
            onChange={(e) => setOrigin(e.target.value)}
          />
          <input
            type="text"
            style={routeInputStyle}
            value={destination}
            placeholder={t('map.destination')}
            onChange={(e) => setDestination(e.target.value)}
          />
          <button type="button" style={ghostBtnStyle} onClick={drawRoute}>
            {t('map.directions')}
          </button>
          <button type="button" style={ghostBtnStyle} onClick={clearRoute}>
            {t('map.clearRoute')}
          </button>
        </div>

        {routeError && <div style={errorStyle}>⚠️ {routeError}</div>}
        {statusMsg && <div style={errorStyle}>⚠️ {statusMsg}</div>}
        </div>
        )}
      </LoadScript>

      {loadError && (
        <div style={{ ...errorStyle, position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
          ⚠️ {t('map.loadFailed')}
        </div>
      )}
    </div>
  )
}

export default GoogleMapView