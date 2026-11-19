/**
 * 地图找房（C 端公开页，匿名可进）——对齐贝壳地图找房。
 *
 * 结构：
 * - 全屏地图 + 价格气泡 marker（低视野按 bounds 拉取，400ms 防抖）；
 * - 顶部悬浮筛选：业务/类型快选 + 区域 / 价格 / 户型 下拉；
 * - 底部房源卡片横滑（Swiper），卡片与气泡双向联动：
 *   滑卡片 → 地图居中该点；点气泡 → 选中并切到对应卡片；
 * - 右侧定位 / 缩放悬浮控件。
 *
 * 数据源 `GET /public/map-points`：只返回所属楼盘有经纬度的房源，
 * 标出来的点都能点开详情。城市统一传定位 Store 的 cityKey（后端做 slug 归一化）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Image, Map, ScrollView, Swiper, SwiperItem } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { MAP_LIMIT } from '@/lib/pagination'
import { BANGKOK_CENTER } from '@/constants/location'
import { publicApi, type PublicMapPoint } from '@/services/publicApi'
import { resolveMediaUrl } from '@/lib/api'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { ICONS, iconStyle } from '@/utils/icons'
import { parseRange, rangeOptions, RENT_PRICE_RANGES, SELL_PRICE_RANGES } from '@/lib/categoryShared'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

type Biz = '' | 'rent' | 'sell'
type Cat = '' | 'new' | 'resale' | 'office' | 'shop' | 'factory'
type Panel = '' | 'region' | 'price' | 'bed'

/** 地图初始中心（仅兜底）：优先取用户定位，其次取首个点位。 */
const DEFAULT_CENTER = { latitude: BANGKOK_CENTER.lat, longitude: BANGKOK_CENTER.lng }

interface Bounds {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

interface Option {
  key: string
  label: string
  min?: number
  max?: number
}

/** 两点球面距离（km），与 App 卡片同口径 */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export default function PublicMapPage() {
  const { t } = useI18n()
  const router = useRouter()
  const cityKey = useLocationStore((s) => s.selection.cityKey)

  // 初始筛选：从找房页/分类页的地图入口带过来（listing_type / ptype / new）
  const initBiz: Biz =
    router.params?.listing_type === 'sell' ? 'sell' : router.params?.listing_type === 'rent' ? 'rent' : ''
  const initCat: Cat = (() => {
    const p = router.params ?? {}
    if (p.new === '1') return 'new'
    if (p.new === '0') return 'resale'
    const ptype = p.ptype
    return ptype === 'office' || ptype === 'shop' || ptype === 'factory' ? ptype : ''
  })()

  const [biz, setBiz] = useState<Biz>(initBiz)
  const [cat, setCat] = useState<Cat>(initCat)
  const [district, setDistrict] = useState('')
  const [priceKey, setPriceKey] = useState('')
  const [bedKey, setBedKey] = useState('')
  const [districts, setDistricts] = useState<string[]>([])
  const [panel, setPanel] = useState<Panel>('')

  const [points, setPoints] = useState<PublicMapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [scale, setScale] = useState(13)
  const [cardIndex, setCardIndex] = useState(0)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  const centeredRef = useRef(false)
  const boundsRef = useRef<Bounds | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCardRef = useRef(-1)

  // 类型口径：新房/二手房锁定 sell；写字楼/商铺/厂房走 property_type
  const effectiveListingType: 'rent' | 'sell' | undefined =
    cat === 'new' || cat === 'resale' ? 'sell' : biz || undefined
  const propertyType = cat === 'office' || cat === 'shop' || cat === 'factory' ? cat : undefined
  const isNew = cat === 'new' ? true : cat === 'resale' ? false : undefined
  const isSell = effectiveListingType === 'sell'

  const priceOptions = useMemo<Option[]>(() => {
    const ranges = isSell ? SELL_PRICE_RANGES : RENT_PRICE_RANGES
    return [
      { key: '', label: t('tl.mapAny') },
      ...rangeOptions(t, ranges).map((o) => {
        const { min, max } = parseRange(o.value)
        return { key: o.value, label: o.label, min, max }
      })
    ]
  }, [isSell, t])

  const bedOptions = useMemo<Option[]>(
    () => [
      { key: '', label: t('tl.mapAny') },
      { key: '1', label: `1${t('category.bedroomUnit')}` },
      { key: '2', label: `2${t('category.bedroomUnit')}` },
      { key: '3', label: `3${t('category.bedroomUnit')}+` }
    ],
    [t]
  )

  const regionOptions = useMemo<Option[]>(
    () => [{ key: '', label: t('tl.mapAny') }, ...districts.map((d) => ({ key: d, label: d }))],
    [districts, t]
  )

  const selectedPrice = priceOptions.find((p) => p.key === priceKey) ?? priceOptions[0]

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await publicApi.mapPoints({
        city: cityKey || undefined,
        limit: MAP_LIMIT,
        listing_type: effectiveListingType,
        property_type: propertyType,
        is_new_development: isNew,
        district: district || undefined,
        bedrooms: bedKey ? Number(bedKey) : undefined,
        price_min: selectedPrice?.min,
        price_max: selectedPrice?.max,
        ...(boundsRef.current ?? {})
      })
      const raw = res?.data ?? res
      const arr: PublicMapPoint[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : []
      setPoints(arr.filter((p) => p.lat != null && p.lng != null))
      setFailed(false)
    } catch (err) {
      console.error('[public map] 点位加载失败', err)
      setPoints([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [cityKey, effectiveListingType, propertyType, isNew, district, bedKey, selectedPrice])

  // 城市 / 筛选变化 → 复用当前视野重新拉取
  useEffect(() => {
    fetchPoints()
  }, [fetchPoints])

  // 区域选项跟随业务口径
  useEffect(() => {
    publicApi
      .districts({
        city: cityKey || undefined,
        listing_type: effectiveListingType,
        property_type: propertyType ? [propertyType] : undefined
      })
      .then((res: any) => {
        const raw = res?.data ?? res
        const rows: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []
        setDistricts(
          Array.from(
            new Set(rows.map((r) => String(r?.district ?? '').trim()).filter(Boolean))
          )
        )
      })
      .catch(() => setDistricts([]))
  }, [cityKey, effectiveListingType, propertyType])

  // 默认中心：优先定位，失败则用首个点位
  useEffect(() => {
    Taro.getLocation({ type: 'gcj02' })
      .then((loc) => {
        centeredRef.current = true
        setGps({ lat: loc.latitude, lng: loc.longitude })
        setCenter({ latitude: loc.latitude, longitude: loc.longitude })
      })
      .catch(() => {
        /* 用户拒绝定位：改用首个点位作为中心 */
      })
  }, [])

  useEffect(() => {
    if (centeredRef.current || points.length === 0) return
    const p = points[0]
    if (p.lat != null && p.lng != null) {
      centeredRef.current = true
      setCenter({ latitude: Number(p.lat), longitude: Number(p.lng) })
    }
  }, [points])

  // 点位刷新后卡片下标回到合法范围（视野变化后列表可能整体换了一批）
  useEffect(() => {
    if (!points.length) {
      setCardIndex(0)
      lastCardRef.current = -1
      return
    }
    if (cardIndex > points.length - 1) setCardIndex(0)
  }, [points, cardIndex])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  const onRegionChange = (e: any) => {
    const d = e?.detail ?? {}
    const type = d.type ?? e?.type
    if (type && type !== 'end') return
    // 程序化移动（初始渲染 / 卡片联动）不按视野收敛，否则联动时列表会被收缩成一条
    const causedBy = d.causedBy ?? e?.causedBy
    if (causedBy === 'update') return
    const region = d.region ?? d.detail?.region ?? e?.region
    const ne = region?.northeast
    const sw = region?.southwest
    if (!ne || !sw) return
    boundsRef.current = {
      min_lat: Math.min(sw.latitude, ne.latitude),
      max_lat: Math.max(sw.latitude, ne.latitude),
      min_lng: Math.min(sw.longitude, ne.longitude),
      max_lng: Math.max(sw.longitude, ne.longitude)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPoints(), 400)
  }

  const priceText = (p: PublicMapPoint) =>
    fmtMoney(p.price || p.monthly_rent || 0, p.currency || 'THB')

  // 价格气泡：白底圆角 label + 主色描边；选中态加粗放大
  const markers = useMemo(() => {
    const rows = points.map((p, i) => {
      const on = i === cardIndex
      return {
        id: i,
        latitude: Number(p.lat),
        longitude: Number(p.lng),
        iconPath: ICONS.location,
        width: on ? 30 : 24,
        height: on ? 30 : 24,
        zIndex: on ? 9 : 1,
        label: {
          content: priceText(p),
          color: on ? '#171a1d' : '#14b8a6',
          fontSize: on ? 12 : 11,
          bgColor: '#ffffff',
          padding: 5,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: on ? '#14b8a6' : '#e6e9ec',
          anchorX: -18,
          anchorY: -44
        },
        title: p.project_name || p.room_number || p.address || ''
      }
    })
    // 选中的放最后，避免被相邻气泡遮住
    return rows.sort((a, b) => (a.id === cardIndex ? 1 : b.id === cardIndex ? -1 : 0))
  }, [points, cardIndex])

  const centerOn = useCallback((p: PublicMapPoint) => {
    if (p.lat == null || p.lng == null) return
    setCenter({ latitude: Number(p.lat), longitude: Number(p.lng) })
  }, [])

  const onMarkerTap = (e: any) => {
    const id = Number(e?.detail?.markerId)
    const p = points[id]
    if (!p) return
    setCardIndex(id)
    lastCardRef.current = id
    centerOn(p)
  }

  const onSwiperChange = (e: any) => {
    const i = Number(e?.detail?.current ?? 0)
    if (i === lastCardRef.current) return
    lastCardRef.current = i
    setCardIndex(i)
    const p = points[i]
    if (p) centerOn(p)
  }

  const locate = () => {
    Taro.getLocation({ type: 'gcj02' })
      .then((loc) => {
        setGps({ lat: loc.latitude, lng: loc.longitude })
        setCenter({ latitude: loc.latitude, longitude: loc.longitude })
        setScale(15)
      })
      .catch(() => {
        Taro.showToast({ title: t('tl.mapLocate'), icon: 'none' })
      })
  }

  const bizOptions: Array<[string, string]> = [
    ['', t('pub.typeAll')],
    ['rent', t('pub.typeRent')],
    ['sell', t('pub.typeSell')],
    ['new', t('tl.mapNew')],
    ['resale', t('tl.mapResale')],
    ['office', t('tl.mapOffice')],
    ['shop', t('tl.mapShop')],
    ['factory', t('tl.mapFactory')]
  ]
  const activeQuick = cat || biz || ''

  const pickQuick = (key: string) => {
    if (key === 'new' || key === 'resale' || key === 'office' || key === 'shop' || key === 'factory') {
      setCat(key as Cat)
      setBiz('')
      return
    }
    setBiz(key as Biz)
    setCat('')
  }

  const openDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })

  const panelOptions =
    panel === 'region' ? regionOptions : panel === 'price' ? priceOptions : bedOptions
  const panelKey = panel === 'region' ? district : panel === 'price' ? priceKey : bedKey
  const pickOption = (key: string) => {
    if (panel === 'region') setDistrict(key)
    if (panel === 'price') setPriceKey(key)
    if (panel === 'bed') setBedKey(key)
    setPanel('')
  }

  const chipLabel = (kind: Panel) => {
    if (kind === 'region') return district || t('tl.mapRegion')
    if (kind === 'price')
      return priceKey ? selectedPrice?.label ?? t('tl.mapPrice') : t('tl.mapPrice')
    const bed = bedOptions.find((b) => b.key === bedKey)
    return bedKey ? bed?.label ?? t('tl.mapBed') : t('tl.mapBed')
  }
  const chipActive = (kind: Panel) =>
    kind === 'region' ? !!district : kind === 'price' ? !!priceKey : !!bedKey

  return (
    <View className='map-page'>
      <ShellHeader title={t('tl.mapTitle')} />

      <View className='map-stage'>
        <Map
          className='map-canvas'
          latitude={center.latitude}
          longitude={center.longitude}
          scale={scale}
          markers={markers as any}
          showLocation
          onRegionChange={onRegionChange}
          onMarkerTap={onMarkerTap}
          onError={() => {}}
        />

        {/* 顶部悬浮筛选：业务/类型快选 + 区域/价格/户型下拉 */}
        <View className='map-top'>
          <ScrollView scrollX className='map-quick' showScrollbar={false}>
            <View className='map-quick__row'>
              {bizOptions.map(([key, label]) => (
                <View
                  key={key || 'all'}
                  className={`map-quick__item${activeQuick === key ? ' map-quick__item--on' : ''}`}
                  onClick={() => pickQuick(key)}
                >
                  <Text>{label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View className='map-selects'>
            {(['region', 'price', 'bed'] as Panel[]).map((kind) => (
              <View
                key={kind}
                className={`map-select${chipActive(kind) ? ' map-select--on' : ''}`}
                onClick={() => setPanel(panel === kind ? '' : kind)}
              >
                <Text className='map-select__label'>{chipLabel(kind)}</Text>
                <View className={`map-select__caret${panel === kind ? ' map-select__caret--up' : ''}`} />
              </View>
            ))}
          </View>

          {panel ? (
            <View className='map-panel'>
              <View className='map-panel__grid'>
                {panelOptions.map((opt) => (
                  <View
                    key={opt.key || 'any'}
                    className={`map-panel__opt${opt.key === panelKey ? ' map-panel__opt--on' : ''}`}
                    onClick={() => pickOption(opt.key)}
                  >
                    <Text>{opt.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* 右侧悬浮控件：定位 / 缩放 */}
        <View className='map-controls'>
          <View className='map-control' onClick={locate}>
            <View style={iconStyle('location', 34)} />
          </View>
          <View className='map-zoom'>
            <View className='map-zoom__btn' onClick={() => setScale((s) => Math.min(s + 1, 18))}>
              <Text className='map-zoom__text'>+</Text>
            </View>
            <View className='map-zoom__split' />
            <View className='map-zoom__btn' onClick={() => setScale((s) => Math.max(s - 1, 4))}>
              <Text className='map-zoom__text'>−</Text>
            </View>
          </View>
        </View>

        {/* 视野结果数 */}
        <View className='map-count'>
          <Text>
            {failed
              ? t('tl.mapLoadFailed')
              : loading
                ? t('pub.loading')
                : t('tl.mapCount', { n: points.length })}
          </Text>
        </View>

        {/* 底部房源卡片横滑：滑动即把地图居中到该房源 */}
        <View className='map-cards'>
          {points.length ? (
            <Swiper
              className='map-cards__swiper'
              current={cardIndex}
              previousMargin='28rpx'
              nextMargin='28rpx'
              onChange={onSwiperChange}
            >
              {points.map((p) => {
                const isSellPoint = p.listing_type === 'sell'
                const price = fmtMoney(p.price || p.monthly_rent || 0, p.currency || 'THB')
                const title = p.project_name || p.room_number || p.address || t('pub.listingItem')
                const dist =
                  gps && p.lat != null && p.lng != null
                    ? distanceKm(gps, { lat: Number(p.lat), lng: Number(p.lng) })
                    : null
                return (
                  <SwiperItem key={p.id} className='map-cards__item'>
                    <View className='map-card' onClick={() => openDetail(p.id)}>
                      <View className='map-card__media'>
                        {p.cover ? (
                          <Image
                            className='map-card__img'
                            src={resolveMediaUrl(p.cover) || ''}
                            mode='aspectFill'
                          />
                        ) : (
                          <View className='map-card__noimg'>
                            <Text>{t('pub.noPhoto')}</Text>
                          </View>
                        )}
                      </View>
                      <View className='map-card__body'>
                        <Text className='map-card__title'>{title}</Text>
                        <Text className='map-card__facts'>
                          {[
                            p.bedrooms != null ? `${p.bedrooms}${t('category.bedroomUnit')}` : '',
                            p.size_sqm != null ? `${p.size_sqm} ${t('pub.sqm')}` : ''
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        {p.address ? <Text className='map-card__addr'>{p.address}</Text> : null}
                        <View className='map-card__bottom'>
                          <Text className='map-card__price'>
                            {price}
                            {isSellPoint ? null : (
                              <Text className='map-card__price-sub'>{t('pub.perMonth')}</Text>
                            )}
                          </Text>
                          {dist != null ? (
                            <Text className='map-card__dist'>
                              {dist < 1
                                ? `${Math.round(dist * 1000)} m`
                                : `${dist.toFixed(1)} ${t('pub.km')}`}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </SwiperItem>
                )
              })}
            </Swiper>
          ) : (
            <View className='map-empty'>
              <Text>{loading ? t('pub.loading') : failed ? t('tl.mapLoadFailed') : t('tl.mapEmpty')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
